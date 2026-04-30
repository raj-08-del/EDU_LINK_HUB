/* 
   Community Q&A Page Logic
   Handles: Post Loading, Filtering, Sorting, Reacting, and Modal Management
*/

// Global State
let currentSort = 'newest';
let currentPage = 1;
let currentSearch = '';
let currentTag = '';
let userBookmarkIds = new Set();
let searchTimeout = null;

// Initial Setup
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Check for success message in URL
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === '1') {
        if (window.showToast) window.showToast('✅ Posted successfully!', 'success');
        window.history.replaceState({}, document.title, window.location.pathname);
    }
    
    // 2. Set up Live Search listener
    const sInput = document.getElementById('community-search');
    if (sInput) {
        sInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                currentSearch = e.target.value.trim();
                currentTag = '';
                currentPage = 1;
                loadPosts();
            }, 300);
        });
    }

    // 3. Initial Post Load
    await loadPosts();
});

// Sorting and Filtering
function setSort(sortType) {
    currentSort = sortType;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    const activeBtn = document.getElementById(`btn-${sortType}`);
    if (activeBtn) activeBtn.classList.add('active');

    currentPage = 1;
    loadPosts();
}

function filterByTag(tag) {
    currentTag = tag;
    const searchInput = document.getElementById('community-search');
    if (searchInput) {
        searchInput.value = '';
        currentSearch = '';
    }
    currentPage = 1;
    loadPosts();
}

function changePage(delta) {
    currentPage += delta;
    loadPosts();
}

// Data Fetching
async function loadPosts() {
    const container = document.getElementById('posts-container');
    if (!container) return;

    container.innerHTML = `
      <div class="skeleton-card"></div>
      <div class="skeleton-card"></div>
      <div class="skeleton-card"></div>
    `;
    
    try {
        let url = `/api/community/?sort=${currentSort}&page=${currentPage}`;
        if (currentSearch) url += `&search=${encodeURIComponent(currentSearch)}`;
        if (currentTag) url += `&tag=${encodeURIComponent(currentTag)}`;

        const res = await apiFetch(url);
        
        if (!res || res.error) {
            container.innerHTML = `<div class="empty-state">💬 <br> Failed to load posts</div>`;
            return;
        }
        
        const posts = res.posts || [];
        if (posts.length === 0) {
            renderEmptyState(container);
            document.getElementById('pagination').style.display = 'none';
            return;
        }

        const currentUserId = window.CURRENT_USER_ID || '';
        container.innerHTML = posts.map(post => renderPostCard(post, currentUserId)).join('');
        
        // Update Pagination
        const pag = document.getElementById('pagination');
        if (pag) {
            pag.style.display = 'flex';
            const pageInfo = document.getElementById('pageInfo');
            if (pageInfo) pageInfo.textContent = `Page ${res.page}`;
            
            const prevBtn = document.getElementById('prevPage');
            const nextBtn = document.getElementById('nextPage');
            if (prevBtn) prevBtn.style.display = res.page > 1 ? 'block' : 'none';
            if (nextBtn) nextBtn.style.display = res.has_more ? 'block' : 'none';
        }

    } catch(err) {
        console.error('[Community Load Error]', err);
        container.innerHTML = '<div class="empty-community-state">Network error. Please refresh.</div>';
    }
}

function renderEmptyState(container) {
    if (currentSearch || currentTag) {
        container.innerHTML = `
            <div class="empty-community-state">
              <div style="font-size:4rem; margin-bottom:10px;">🔍</div>
              <h3 style="color:#fff; margin-bottom:8px;">No posts match criteria</h3>
              <button class="btn btn-secondary" onclick="resetFilters()">Clear Filters</button>
            </div>
        `;
    } else {
        container.innerHTML = `
            <div class="empty-community-state">
              <div style="font-size:4rem; margin-bottom:10px;">💬</div>
              <h3 style="color:#fff; margin-bottom:8px;">No posts yet</h3>
              <p style="color:#888; margin-bottom:16px;">Be the first to start a discussion!</p>
              <button class="btn btn-primary" onclick="openModal('ask-question-modal')">+ Ask a Question</button>
            </div>
        `;
    }
}

function resetFilters() {
    currentSearch = '';
    currentTag = '';
    const searchInput = document.getElementById('community-search');
    if (searchInput) searchInput.value = '';
    loadPosts();
}

// Card Rendering
function renderPostCard(post, authUserId) {
    const postId = post._id || post.id;
    const isOwner = post.is_owner === true || post.created_by === authUserId;
    const userRole = (window.CURRENT_USER_ROLE || 'student').toLowerCase();
    const isAdmin = userRole === 'admin';
    const canManage = isOwner || isAdmin;
    
    const postType = (post.post_type || post.type || 'Discussion').toUpperCase();
    const formattedDate = new Date(post.created_at).toLocaleDateString();

    return `
      <div class="post-card" data-post-id="${postId}">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <span style="background:rgba(255,42,109,0.15); border:1px solid rgba(255,42,109,0.4);
            color:#ff2a6d; padding:3px 12px; border-radius:20px; font-size:11px; font-weight:700;
            text-transform:uppercase; letter-spacing:0.06em;">
            ${postType}
          </span>
            <button class="post-three-dot" data-id="${postId}"
              style="background:none;border:none;color:#555;cursor:pointer;
              font-size:18px;padding:4px 8px;border-radius:4px;"
              onclick="event.stopPropagation(); toggleMenu('${postId}')">⋮</button>
            <ul class="dropdown-menu" id="menu-${postId}">
              <li onclick="bookmarkPost('${postId}')">🔖 Bookmark Post</li>
              <li onclick="sharePost('${postId}', '${escapeHtml(post.title)}')">🔗 Share Post</li>
              ${canManage ? `
                <li onclick="editPost('${postId}')">✏️ Edit Post</li>
                <li onclick="hidePost('${postId}')" class="warning-item">👁️ Hide Post</li>
                <li onclick="deletePost('${postId}')" class="danger-item">🗑️ Delete Post</li>
              ` : ''}
              <li onclick="reportContent('${postId}')">🚩 Report</li>
            </ul>
        </div>

        <h3 style="color:#fff; font-family:'Rajdhani',sans-serif; font-size:19px;
          font-weight:700; margin:0 0 8px; line-height:1.3; letter-spacing:0.02em; cursor:pointer;"
          onclick="location.href='/community/${postId}'">
          ${escapeHtml(post.title)}
        </h3>

        ${post.content ? `
          <p style="color:#888; font-size:13px; margin:0 0 12px; line-height:1.6;">
            ${escapeHtml(post.content).substring(0, 140)}${post.content.length > 140 ? '...' : ''}
          </p>
        ` : ''}

        ${post.tags && post.tags.length ? `
          <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:14px;">
            ${post.tags.map(tag => `
              <span class="community-tag" onclick="filterByTag('${tag}')">
                #${tag}
              </span>
            `).join('')}
          </div>
        ` : ''}

        <div class="sc-footer">
          <button onclick="reactToPost('${postId}', this)" class="reaction-btn">
            👍 <span id="reaction-count-${postId}">${post.total_reactions || 0}</span>
          </button>

          <a href="/community/channel/general?prefill=Discussing%3A%20${encodeURIComponent(post.title)}%20-%20" class="chat-btn">
            💬 Chat
          </a>

          <button onclick="location.href='/community/${postId}'" class="reaction-btn">
            🗨️ ${post.reply_count || 0} Replies
          </button>

          <span style="color:#555; font-size:12px; margin-left:auto; display:flex; flex-direction:column; align-items:flex-end;">
            ${formattedDate}
            ${isAdmin && post.author_name ? `<span style="font-size:10px; color:#05d9e8; font-weight:600;">👤 ${escapeHtml(post.author_name)} <span style="background:rgba(255,71,87,0.15);color:#ff4757;border:1px solid rgba(255,71,87,0.3);border-radius:3px;padding:0 4px;font-size:9px;">ADMIN</span></span>` : ''}
          </span>
        </div>
      </div>
    `;
}

// Post Actions
async function submitPost() {
    const btn = document.getElementById('submit-post-btn');
    if (btn) { btn.textContent = '🚀 Posting...'; btn.disabled = true; }

    try {
        const type = document.getElementById('q-type')?.value || 'Question';
        const title = document.getElementById('q-title')?.value?.trim();
        const content = document.getElementById('q-content')?.value || '';
        const tags = (document.getElementById('q-tags')?.value || '').split(',').map(t=>t.trim()).filter(Boolean);

        if (!title) {
            if (window.showToast) window.showToast('❌ Title is required', 'error');
            if (btn) { btn.textContent = 'Post Anonymously'; btn.disabled = false; }
            return;
        }

        let pollData = null;
        if (type === 'Poll') {
            const pollQ = document.getElementById('poll-question')?.value?.trim() || title;
            const optionInputs = document.querySelectorAll('.q-opt');
            const options = [...optionInputs].map(i => i.value.trim()).filter(Boolean);
            if (options.length < 2) {
                if (window.showToast) window.showToast('Need at least 2 poll options', 'error');
                if (btn) { btn.textContent = 'Post Anonymously'; btn.disabled = false; }
                return;
            }
            pollData = { question: pollQ, options: options };
        }

        const payload = {
            title, content, post_type: type.toLowerCase(),
            anonymous: true, tags, poll: pollData
        };

        const res = await fetch('/api/community/posts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            const data = await res.json();
            if (window.showToast) window.showToast('✅ Posted Successfully!', 'success');
            setTimeout(() => {
                closeModal('ask-question-modal');
                window.location.href = `/community?success=1&new_post=${data.id || data._id}`;
            }, 600);
        } else {
            const error = await res.json();
            if (window.showToast) window.showToast('❌ Failed: ' + (error.message || 'Unknown error'), 'error');
            if (btn) { btn.textContent = 'Post Anonymously'; btn.disabled = false; }
        }
    } catch(e) {
        console.error('[Post Submit Error]', e);
        if (window.showToast) window.showToast('❌ Error: ' + e.message, 'error');
        if (btn) { btn.textContent = 'Post Anonymously'; btn.disabled = false; }
    }
}

async function reactToPost(postId, btnEl) {
    try {
        const res = await fetch(`/api/community/posts/${postId}/react`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({reaction: 'like'})
        });

        const data = await res.json();
        if (res.ok) {
            const countEl = document.getElementById('reaction-count-' + postId);
            if (countEl) countEl.textContent = data.total_reactions || 0;
            if (btnEl) {
                btnEl.style.background = data.action === 'added' ? 'rgba(245,158,11,0.25)' : 'rgba(245,158,11,0.1)';
            }
            if (window.showToast) window.showToast(data.action === 'added' ? '👍 Liked!' : '👎 Unliked', 'success');
        }
    } catch(e) {
        console.error('[React Error]', e);
    }
}

async function deletePost(postId) {
    if (!confirm('Delete this post permanently?')) return;
    try {
        const res = await apiFetch(`/api/community/${postId}`, { method: 'DELETE' });
        if (res && !res.error) {
            if (window.showToast) window.showToast('🗑️ Post deleted', 'success');
            const card = document.querySelector(`[data-post-id="${postId}"]`);
            if (card) {
                card.classList.add('card-exit-active');
                setTimeout(() => card.remove(), 400);
            }
        }
    } catch(e) {
        console.error('[Delete Error]', e);
    }
}

// Modal Helpers
window.openModal = function(id) {
    const el = document.getElementById(id);
    if (el) {
        el.style.display = 'flex';
        // Add .show for animation compatibility
        setTimeout(() => el.classList.add('show'), 10);
    }
};

window.closeModal = function(id) {
    const el = document.getElementById(id);
    if (el) {
        el.classList.remove('show');
        setTimeout(() => {
            if (!el.classList.contains('show')) el.style.display = 'none';
        }, 300);
    }
};

function toggleMenu(id) {
    const menu = document.getElementById(`menu-${id}`);
    if (!menu) return;
    const isOpen = menu.classList.contains('open');
    document.querySelectorAll('.dropdown-menu.open').forEach(m => m.classList.remove('open'));
    if (!isOpen) menu.classList.add('open');
}

// Global click listener to close menus
document.addEventListener('click', e => {
    if (!e.target.closest('.dropdown-menu') && !e.target.closest('.post-three-dot')) {
        document.querySelectorAll('.dropdown-menu.open').forEach(m => m.classList.remove('open'));
    }
});

// Helper: Escape HTML
function escapeHtml(text) {
    if (!text) return '';
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
}

// Poll UI Helpers
function togglePollSection(mode = 'create') {
    const prefix = mode === 'edit' ? 'edit-' : '';
    const type = document.getElementById(`${prefix}q-type`).value;
    const pollSection = document.getElementById(`${prefix}poll-section`);
    if (type === 'Poll') {
        pollSection.style.display = 'block';
        if (mode === 'create') initPollOptions();
    } else {
        pollSection.style.display = 'none';
    }
}

function initPollOptions() {
    const list = document.getElementById('poll-options-list');
    if (list) {
        list.innerHTML = '';
        list.appendChild(createPollOptionRow('Option 1'));
        list.appendChild(createPollOptionRow('Option 2'));
    }
}

function addPollOption(mode = 'create') {
    const prefix = mode === 'edit' ? 'edit-' : '';
    const list = document.getElementById(`${prefix}poll-options-list`);
    const count = list.querySelectorAll('.poll-opt-row').length;
    if (count >= 6) {
        if (window.showToast) window.showToast('Maximum 6 options allowed');
        return;
    }
    list.appendChild(createPollOptionRow(`Option ${count + 1}`, '', mode));
}

function createPollOptionRow(placeholder, value = '', mode = 'create') {
    const wrapper = document.createElement('div');
    wrapper.className = 'poll-opt-row';
    wrapper.style.cssText = 'display:flex; gap:8px; align-items:center; margin-bottom:8px;';
    
    const input = document.createElement('input');
    input.className = 'q-opt poll-option-input';
    input.placeholder = placeholder;
    input.value = value;
    input.style.cssText = 'flex:1; background:#0a1628; border:1px solid #05d9e8; border-radius:8px; padding:10px 14px; color:#fff;';
    
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = '✕';
    removeBtn.style.cssText = 'background:#1a0a0a; border:1px solid #ff2a6d; color:#ff2a6d; border-radius:6px; width:36px; height:36px; cursor:pointer;';
    removeBtn.onclick = () => wrapper.remove();
    
    wrapper.appendChild(input);
    wrapper.appendChild(removeBtn);
    return wrapper;
}
