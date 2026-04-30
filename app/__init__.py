import os
from dotenv import load_dotenv
load_dotenv()

import threading
from flask import Flask, jsonify
from flask_pymongo import PyMongo
from flask_jwt_extended import JWTManager
from flask_cors import CORS
from flask_bcrypt import Bcrypt
from werkzeug.middleware.proxy_fix import ProxyFix
from datetime import timedelta

mongo = PyMongo()
jwt = JWTManager()
bcrypt = Bcrypt()
init_lock = threading.Lock()

from flask.json.provider import DefaultJSONProvider
from bson import ObjectId
from datetime import datetime

class MongoJSONProvider(DefaultJSONProvider):
    def default(self, obj):
        if isinstance(obj, ObjectId):
            return str(obj)
        if isinstance(obj, datetime):
            return obj.isoformat()
        return super().default(obj)


def create_app():
    app = Flask(__name__)
    app.json = MongoJSONProvider(app)

    # Read GOOGLE_CLIENT_ID
    app.config['GOOGLE_CLIENT_ID'] = os.environ.get('GOOGLE_CLIENT_ID', '')
    


    # Configuration
    app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'flask_secret_key_change_in_production_2024')
    
    # Prioritise Render/Production environment variables
    mongo_uri = os.environ.get('MONGO_URI')
    if not mongo_uri:
        # Fallback to local if not set
        mongo_uri = 'mongodb://127.0.0.1:27017/edu_link_hub?serverSelectionTimeoutMS=5000'
        print(">>> WARNING: MONGO_URI not found in environment. Using local fallback.")
    
    app.config['MONGO_URI'] = mongo_uri
    app.config['JWT_SECRET_KEY'] = os.environ.get('JWT_SECRET_KEY', 'edu_link_hub_secret_key_change_in_production_2024')
    app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(days=7)
    app.config['JWT_TOKEN_LOCATION'] = ['cookies']
    app.config['JWT_COOKIE_SECURE'] = os.environ.get('JWT_COOKIE_SECURE', 'False').lower() == 'true'
    app.config['JWT_COOKIE_SAMESITE'] = 'Lax'
    app.config['JWT_COOKIE_CSRF_PROTECT'] = False

    # Initialize extensions
    CORS(app, resources={r"/api/*": {"origins": "*"}})

    # Handle Proxy headers (important for Cloudflare/Render)
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)

    # Append timeout params if missing to prevent hanging
    if 'serverSelectionTimeoutMS' not in app.config['MONGO_URI']:
        sep = '&' if '?' in app.config['MONGO_URI'] else '?'
        app.config['MONGO_URI'] += f"{sep}serverSelectionTimeoutMS=10000&connectTimeoutMS=10000"

    # Initialize PyMongo with the final URI
    try:
        mongo.init_app(app)
        # Verify connection immediately
        with app.app_context():
            mongo.db.command('ping')
        print(f">>> MongoDB connected successfully to: {app.config['MONGO_URI'].split('@')[-1] if '@' in app.config['MONGO_URI'] else 'local'}")
    except Exception as e:
        print(f">>> CRITICAL: MongoDB connection failed! Error: {e}")
        # We don't force a fallback to 127.0.0.1 here because if the provided URI fails, 
        # the app is likely in a broken state anyway on Render. 
        # However, we allow the app to start so logs can be inspected.
    jwt.init_app(app)
    bcrypt.init_app(app)

    # Deferred index creation + migrations on first request
    @app.before_request
    def ensure_indexes():
        if not getattr(app, '_indexes_created', False):
            with init_lock:
                if not getattr(app, '_indexes_created', False):
                    try:
                        # Actual health check
                        mongo.db.command('ping')
                        _create_indexes()
                        _run_migrations()
                        app._indexes_created = True
                        print(">>> MongoDB Connected & Migrated Successfully")
                    except Exception as e:
                        app.logger.error(f"CRITICAL: MongoDB Connection Failed: {str(e)}")
                        # Do not set _indexes_created to True so it retries on next request
                        return jsonify({"message": "Database connection is currently unavailable."}), 503

    # Register blueprints
    from app.routes.auth import auth_bp
    from app.routes.admin import admin_bp         # Admin Features
    from app.routes.events import events_bp
    from app.routes.opportunities import opportunities_bp
    from app.routes.community import community_bp
    from app.routes.notifications import notifications_bp
    from app.routes.keywords import keywords_bp
    from app.routes.pages import pages_bp
    from app.routes.upload import upload_bp
    from app.routes.chat import chat_bp
    from app.routes.study_groups import study_groups_bp
    from app.routes.leaderboard import leaderboard_bp
    from app.routes.bookmarks import bookmarks_bp   # F4
    from app.routes.reports import reports_bp        # F7
    from app.routes.colleges import colleges_bp
    from app.routes.resources import resources_bp
    from app.routes.stats import stats_bp
    from app.routes.social_integrations import social_integrations_bp

    app.register_blueprint(auth_bp, url_prefix='/api/auth')
    app.register_blueprint(admin_bp, url_prefix='/api/admin')
    app.register_blueprint(events_bp, url_prefix='/api/events')
    app.register_blueprint(opportunities_bp, url_prefix='/api/opportunities')
    app.register_blueprint(community_bp)
    app.register_blueprint(notifications_bp, url_prefix='/api/notifications')
    app.register_blueprint(keywords_bp, url_prefix='/api/keywords')
    app.register_blueprint(pages_bp)
    app.register_blueprint(upload_bp, url_prefix='/api/upload')
    app.register_blueprint(chat_bp, url_prefix='/api/chat')
    app.register_blueprint(study_groups_bp, url_prefix='/api/study-groups')
    app.register_blueprint(leaderboard_bp, url_prefix='/api/leaderboard')
    app.register_blueprint(bookmarks_bp, url_prefix='/api/bookmarks')  # F4
    app.register_blueprint(reports_bp, url_prefix='/api/reports')       # F7
    app.register_blueprint(colleges_bp, url_prefix='/api/colleges')
    app.register_blueprint(resources_bp, url_prefix='/api/resources')
    app.register_blueprint(stats_bp, url_prefix='/api/stats')
    app.register_blueprint(social_integrations_bp, url_prefix='/api/social')

    @app.cli.command('backfill-points')
    def backfill_points_command():
        """Backfill points for all existing users"""
        from app.routes.leaderboard import backfill_all_user_points
        backfill_all_user_points()

    # Global error handlers
    @app.errorhandler(400)
    def bad_request(error):
        return {'message': str(error)}, 400

    @app.errorhandler(404)
    def not_found(error):
        return {'message': 'Resource not found'}, 404

    @app.errorhandler(Exception)
    def handle_exception(e):
        import traceback
        # Logging to terminal for root-cause analysis
        print("=== UNHANDLED RECEPTION ERROR ===")
        traceback.print_exc()
        print("================================")
        return {'message': 'An internal server error occurred', 'error': str(e)}, 500

    # Health check
    @app.route('/api/health')
    def health():
        return {'status': 'ok'}

    return app


def _run_migrations():
    """Run one-time data migrations."""
    try:
        from app.routes.community import migrate_upvotes_to_reactions
        migrate_upvotes_to_reactions()
    except Exception as e:
        print(f">>> Migration warning: {e}")


def _create_indexes():
    """Create MongoDB indexes for performance."""
    try:
        db = mongo.db
        db.users.create_index('email', unique=True)
        db.events.create_index([('category', 1)])
        db.events.create_index([('date', 1)])
        db.events.create_index([('created_at', -1)])
        db.opportunities.create_index([('category', 1), ('status', 1)])
        db.opportunities.create_index([('is_archived', 1), ('status', 1)])
        db.opportunities.create_index([('deadline', 1)])
        db.opportunities.create_index([('created_at', -1)])
        db.community_posts.create_index([('tags', 1)])
        db.notifications.create_index([('user_id', 1), ('read', 1), ('created_at', -1)])
        db.reports.create_index([('status', 1), ('created_at', -1)])
        # Security indexes
        db.auth_otps.create_index([('createdAt', 1)], expireAfterSeconds=300)
        db.auth_otps.create_index([('phone', 1)])
        db.rate_limits.create_index([('ip', 1), ('action', 1), ('timestamp', -1)])
        db.security_logs.create_index([('ip', 1)])
        db.security_logs.create_index([('timestamp', -1)])
        # College & Resource indexes
        db.colleges.create_index([('name', 1)])
        db.colleges.create_index([('city', 1), ('state', 1)])
        db.departments.create_index([('college_id', 1)])
        db.dept_resources.create_index([('department_id', 1), ('semester', 1)])
        db.college_members.create_index([('user_id', 1), ('college_id', 1)], unique=True)
        # Leaderboard indexes
        db.user_points.create_index('user_id', unique=True)
        db.user_points.create_index([('total_points', -1)])
        # Password reset TTL index (30 minutes)
        db.password_resets.create_index('expires_at', expireAfterSeconds=0)
    except Exception as e:
        print(f"Index creation note: {e}")
