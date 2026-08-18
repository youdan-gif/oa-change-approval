// === 全局工具 ===

const API = {
  get: (url) => fetch(url, { headers: API.headers() }).then(API.handle),
  post: (url, data) => fetch(url, { method: 'POST', headers: { ...API.headers(), 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(API.handle),
  upload: (url, formData) => fetch(url, { method: 'POST', headers: API.headers(), body: formData }).then(API.handle),
  delete: (url) => fetch(url, { method: 'DELETE', headers: API.headers() }).then(API.handle),
  headers: () => {
    const token = localStorage.getItem('token');
    return token ? { 'Authorization': 'Bearer ' + token } : {};
  },
  handle: async (res) => {
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '请求失败');
    return data;
  }
};

function checkAuth() {
  const token = localStorage.getItem('token');
  const user = localStorage.getItem('user');
  if (!token || !user) {
    window.location.href = '#/login';
    return null;
  }
  return JSON.parse(user);
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = '#/login';
  render();
}

function showAlert(msg, type = 'error') {
  const el = document.getElementById('alert');
  if (!el) return;
  el.className = `alert alert-${type}`;
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 5000);
}

function formatDate(d) {
  if (!d) return '-';
  return d.replace('T', ' ').substring(0, 19);
}

function statusBadge(status) {
  const map = {
    'pending': ['待审核', 'badge-warning'],
    'approved': ['已通过', 'badge-success'],
    'rejected': ['已驳回', 'badge-danger'],
    'returned': ['已退回', 'badge-warning'],
    'active': ['流转中', 'badge-primary'],
    'draft': ['草稿', 'badge-gray'],
  };
  const [label, cls] = map[status] || [status, 'badge-gray'];
  return `<span class="badge ${cls}">${label}</span>`;
}

function nodeTypeLabel(type) {
  return { submit: '提交资料', approve: '审批', countersign: '会签', cc: '抄送' }[type] || type;
}

// === 路由 ===

function getHash() {
  const hash = window.location.hash || '#/login';
  return hash.replace('#', '');
}

function navigate(path) {
  window.location.hash = path;
  render();
  window.scrollTo(0, 0);
}

// === 页面渲染 ===

function render() {
  const path = getHash();
  const app = document.getElementById('app');

  // 需要登录的页面
  const protectedPaths = ['/dashboard', '/create', '/detail', '/admin', '/my-initiated', '/my-todos', '/my-processed', '/all-approvals'];
  const isProtected = protectedPaths.some(p => path.startsWith(p));

  if (isProtected) {
    const user = checkAuth();
    if (!user) return;
    renderApp(user);
  } else if (path === '/login') {
    renderLogin();
  } else if (path === '/register') {
    renderRegister();
  } else {
    window.location.hash = '/login';
    renderLogin();
  }
}

// === 登录页 ===
function renderLogin() {
  document.getElementById('app').innerHTML = `
    <div class="login-wrap">
      <div class="login-card">
        <h1>工程变更审批系统</h1>
        <p class="subtitle">五方参建协同 · 全员可发起 · 流程可配置</p>
        <div id="alert" class="alert alert-error hidden"></div>
        <div class="form-group">
          <label>手机号</label>
          <input type="text" id="phone" placeholder="请输入手机号" value="admin">
        </div>
        <div class="form-group">
          <label>密码</label>
          <input type="password" id="password" placeholder="请输入密码" value="admin123">
        </div>
        <button class="btn btn-primary btn-block" onclick="doLogin()">登 录</button>
        <p class="text-center text-muted text-sm mt-2">
          没有账号？<a href="javascript:navigate('/register')">立即注册</a>
        </p>
        <p class="text-center text-muted text-sm" style="margin-top:0.5rem">
          管理员: admin / admin123
        </p>
      </div>
    </div>
  `;
}

async function doLogin() {
  const phone = document.getElementById('phone').value;
  const password = document.getElementById('password').value;
  if (!phone || !password) return showAlert('请输入手机号和密码');

  try {
    const data = await API.post('/api/auth/login', { phone, password });
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    navigate('/dashboard');
  } catch (e) {
    showAlert(e.message);
  }
}

// === 注册页 ===
function renderRegister() {
  const orgTypes = [
    { value: '建设单位', label: '建设' },
    { value: '代建单位', label: '代建' },
    { value: '设计单位', label: '设计' },
    { value: '监理单位', label: '监理' },
    { value: '施工单位', label: '施工' },
  ];

  document.getElementById('app').innerHTML = `
    <div class="login-wrap">
      <div class="login-card" style="max-width:520px">
        <h1>用户注册</h1>
        <p class="subtitle">注册后需管理员审核通过方可使用</p>
        <div id="alert" class="alert alert-error hidden"></div>
        <div class="form-group">
          <label>姓名 *</label>
          <input type="text" id="reg-name" placeholder="请输入真实姓名">
        </div>
        <div class="grid-2">
          <div class="form-group">
            <label>手机号 *</label>
            <input type="text" id="reg-phone" placeholder="作为登录账号">
          </div>
          <div class="form-group">
            <label>密码 *</label>
            <input type="password" id="reg-password" placeholder="设置密码">
          </div>
        </div>
        <div class="form-group">
          <label>邮箱</label>
          <input type="email" id="reg-email" placeholder="选填">
        </div>
        <div class="form-group">
          <label>所属单位类型 *</label>
          <div class="org-types">
            ${orgTypes.map(o => `<label><input type="radio" name="org_type" value="${o.value}">${o.label}</label>`).join('')}
          </div>
        </div>
        <div class="form-group">
          <label>单位名称 *</label>
          <input type="text" id="reg-org-name" placeholder="如：XX建设集团">
        </div>
        <div class="grid-2">
          <div class="form-group">
            <label>专业方向</label>
            <input type="text" id="reg-specialty" placeholder="如：土建/结构/机电">
          </div>
          <div class="form-group">
            <label>岗位/职务</label>
            <input type="text" id="reg-position" placeholder="如：项目总监">
          </div>
        </div>
        <button class="btn btn-primary btn-block" onclick="doRegister()">提交注册</button>
        <p class="text-center text-muted text-sm mt-2">
          已有账号？<a href="javascript:navigate('/login')">返回登录</a>
        </p>
      </div>
    </div>
  `;
}

async function doRegister() {
  const name = document.getElementById('reg-name').value;
  const phone = document.getElementById('reg-phone').value;
  const password = document.getElementById('reg-password').value;
  const email = document.getElementById('reg-email').value;
  const orgType = document.querySelector('input[name="org_type"]:checked')?.value;
  const orgName = document.getElementById('reg-org-name').value;
  const specialty = document.getElementById('reg-specialty').value;
  const position = document.getElementById('reg-position').value;

  if (!name || !phone || !password || !orgType || !orgName) {
    return showAlert('请填写所有必填项');
  }

  try {
    await API.post('/api/auth/register', { name, phone, email, password, org_type: orgType, org_name: orgName, specialty, position });
    document.getElementById('app').innerHTML = `
      <div class="login-wrap">
        <div class="login-card text-center">
          <div style="font-size:3rem;margin-bottom:1rem">✓</div>
          <h1>注册成功</h1>
          <p class="subtitle">您的账号已提交，请等待管理员审核通过后登录使用。</p>
          <button class="btn btn-primary btn-block mt-2" onclick="navigate('/login')">返回登录</button>
        </div>
      </div>
    `;
  } catch (e) {
    showAlert(e.message);
  }
}

// === 主应用框架 ===
function renderApp(user) {
  const path = getHash();
  document.getElementById('app').innerHTML = `
    <div class="app-layout">
      <aside class="sidebar">
        <div class="logo">变更审批OA</div>
        <nav>
          <a href="javascript:navigate('/dashboard')" class="${path === '/dashboard' ? 'active' : ''}">仪表盘</a>
          <a href="javascript:navigate('/create')" class="${path.startsWith('/create') ? 'active' : ''}">发起审批</a>
          <a href="javascript:navigate('/my-todos')" class="${path.startsWith('/my-todos') ? 'active' : ''}">待我处理</a>
          <a href="javascript:navigate('/my-initiated')" class="${path.startsWith('/my-initiated') ? 'active' : ''}">我发起的</a>
          <a href="javascript:navigate('/my-processed')" class="${path.startsWith('/my-processed') ? 'active' : ''}">我已处理</a>
          <a href="javascript:navigate('/all-approvals')" class="${path.startsWith('/all-approvals') ? 'active' : ''}">全部审批</a>
          ${user.role === 'admin' ? `<a href="javascript:navigate('/admin')" class="${path.startsWith('/admin') ? 'active' : ''}">管理后台</a>` : ''}
        </nav>
        <div class="user-info">
          <div class="name">${user.name}</div>
          <div>${user.org_type}</div>
          <div>${user.position || user.specialty || ''}</div>
          <div class="text-sm" style="margin-top:0.5rem"><a href="javascript:logout()" style="color:#64748b">退出登录</a></div>
        </div>
      </aside>
      <main class="main-area" id="main-content">
      </main>
    </div>
  `;

  // 路由到具体页面
  if (path === '/dashboard') renderDashboard(user);
  else if (path.startsWith('/create')) renderCreate(user);
  else if (path.startsWith('/detail/')) renderDetail(path.split('/detail/')[1], user);
  else if (path.startsWith('/my-todos')) renderMyTodos(user);
  else if (path.startsWith('/my-initiated')) renderMyInitiated(user);
  else if (path.startsWith('/my-processed')) renderMyProcessed(user);
  else if (path.startsWith('/all-approvals')) renderAllApprovals(user);
  else if (path.startsWith('/admin')) renderAdmin(user);
}

// === 仪表盘 ===
async function renderDashboard(user) {
  const main = document.getElementById('main-content');
  main.innerHTML = `<p class="page-title">仪表盘</p><div id="dash-content">加载中...</div>`;

  try {
    const [todos, initiated, processed, stats, allReqs] = await Promise.all([
      API.get('/api/approval/my-todos'),
      API.get('/api/approval/my-initiated'),
      API.get('/api/approval/my-processed'),
      API.get('/api/approval/stats'),
      API.get('/api/approval/all')
    ]);

    document.getElementById('dash-content').innerHTML = `
      <div class="flex-between mb-2">
        <h3 style="margin:0">全局数据总览</h3>
        <div class="flex gap-2">
          <button class="btn btn-outline btn-sm" onclick="window.open('/api/approval/export', '_blank')">导出四维智能表格</button>
          <button class="btn btn-primary btn-sm" onclick="navigate('/create')">+ 发起审批</button>
        </div>
      </div>

      <!-- 全局统计卡片 -->
      <div class="stats-grid">
        <div class="stat-card">
          <div class="num" style="color:var(--primary)">${stats.total}</div>
          <div class="label">审批单总数</div>
        </div>
        <div class="stat-card">
          <div class="num" style="color:var(--warning)">${stats.active}</div>
          <div class="label">流转中</div>
        </div>
        <div class="stat-card">
          <div class="num" style="color:var(--success)">${stats.approved}</div>
          <div class="label">已通过</div>
        </div>
        <div class="stat-card">
          <div class="num" style="color:var(--danger)">${stats.rejected}</div>
          <div class="label">已驳回删除</div>
        </div>
      </div>

      <!-- 个人统计卡片 -->
      <div class="stats-grid" style="margin-top:0.5rem">
        <div class="stat-card" style="border-left:3px solid var(--primary)">
          <div class="num" style="color:var(--primary)">${todos.todos.length}</div>
          <div class="label">待我处理</div>
        </div>
        <div class="stat-card" style="border-left:3px solid var(--teal)">
          <div class="num" style="color:var(--teal)">${initiated.requests.length}</div>
          <div class="label">我发起的</div>
        </div>
        <div class="stat-card" style="border-left:3px solid var(--success)">
          <div class="num" style="color:var(--success)">${processed.requests.length}</div>
          <div class="label">我已处理</div>
        </div>
        <div class="stat-card" style="border-left:3px solid var(--gray)">
          <div class="num" style="color:var(--gray)">${allReqs.requests.length}</div>
          <div class="label">全员审批单</div>
        </div>
      </div>

      <!-- 统计图表区 -->
      <div class="grid-2">
        <div class="card">
          <h3 style="margin-bottom:1rem">按单位类型统计</h3>
          ${stats.byOrg.length === 0 ? '<div class="empty">暂无数据</div>' :
            `<div class="table-wrap"><table>
              <thead><tr><th>单位类型</th><th>审批数</th><th>占比</th></tr></thead>
              <tbody>
                ${stats.byOrg.map(o => `
                  <tr>
                    <td>${o.org_type}</td>
                    <td>${o.count}</td>
                    <td>
                      <div style="background:var(--gray-light);border-radius:4px;height:20px;position:relative">
                        <div style="background:var(--primary);height:20px;border-radius:4px;width:${(o.count / stats.total * 100).toFixed(0)}%"></div>
                        <span style="position:absolute;left:50%;top:0;line-height:20px;font-size:0.8rem;color:var(--dark)">${(o.count / stats.total * 100).toFixed(0)}%</span>
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table></div>`
          }
        </div>
        <div class="card">
          <h3 style="margin-bottom:1rem">按变更类型统计</h3>
          ${stats.byType.length === 0 ? '<div class="empty">暂无数据</div>' :
            `<div class="table-wrap"><table>
              <thead><tr><th>变更类型</th><th>审批数</th><th>占比</th></tr></thead>
              <tbody>
                ${stats.byType.map(t => `
                  <tr>
                    <td><span class="badge badge-teal">${t.change_type}</span></td>
                    <td>${t.count}</td>
                    <td>
                      <div style="background:var(--gray-light);border-radius:4px;height:20px;position:relative">
                        <div style="background:var(--teal);height:20px;border-radius:4px;width:${(t.count / stats.total * 100).toFixed(0)}%"></div>
                        <span style="position:absolute;left:50%;top:0;line-height:20px;font-size:0.8rem;color:var(--dark)">${(t.count / stats.total * 100).toFixed(0)}%</span>
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table></div>`
          }
        </div>
      </div>

      <!-- 我的待办 -->
      <div class="card" style="margin-top:1rem">
        <div class="card-header">
          <h3>我的待办事项</h3>
          <span class="badge badge-warning">${todos.todos.length} 项</span>
        </div>
        ${todos.todos.length === 0
          ? '<div class="empty">暂无待办事项</div>'
          : `<div class="table-wrap"><table>
              <thead><tr><th>标题</th><th>发起人</th><th>单位类型</th><th>当前步骤</th><th>节点说明</th><th>发起时间</th><th>操作</th></tr></thead>
              <tbody>
                ${todos.todos.map(t => `
                  <tr>
                    <td><a href="javascript:navigate('/detail/${t.request_id}')">${t.title}</a></td>
                    <td>${t.initiator_name}</td>
                    <td>${t.initiator_org_type}</td>
                    <td>第${t.current_node_index + 1}步</td>
                    <td class="text-sm">${t.node_desc || nodeTypeLabel(t.node_type)}</td>
                    <td class="text-sm">${formatDate(t.created_at)}</td>
                    <td><button class="btn btn-primary btn-sm" onclick="navigate('/detail/${t.request_id}')">处理</button></td>
                  </tr>
                `).join('')}
              </tbody>
            </table></div>`
        }
      </div>

      <!-- 最近审批单（全员可见） -->
      <div class="card" style="margin-top:1rem">
        <div class="card-header">
          <h3>最近审批动态</h3>
          <button class="btn btn-outline btn-sm" onclick="navigate('/all-approvals')">查看全部</button>
        </div>
        ${allReqs.requests.length === 0
          ? '<div class="empty">暂无审批单</div>'
          : `<div class="table-wrap"><table>
              <thead><tr><th>标题</th><th>类型</th><th>发起人</th><th>单位</th><th>状态</th><th>步骤</th><th>时间</th><th>操作</th></tr></thead>
              <tbody>
                ${allReqs.requests.slice(0, 10).map(r => `
                  <tr>
                    <td><a href="javascript:navigate('/detail/${r.id}')">${r.title}</a></td>
                    <td><span class="badge badge-teal">${r.change_type}</span></td>
                    <td>${r.initiator_name}</td>
                    <td>${r.initiator_org_type}</td>
                    <td>${statusBadge(r.status)}</td>
                    <td>${r.status === 'active' ? `第${r.current_node_index + 1}/${r.workflow_config.length}步` : `${r.workflow_config.length}步`}</td>
                    <td class="text-sm">${formatDate(r.created_at)}</td>
                    <td><button class="btn btn-primary btn-sm" onclick="navigate('/detail/${r.id}')">查看</button></td>
                  </tr>
                `).join('')}
              </tbody>
            </table></div>`
        }
      </div>
    `;
  } catch (e) {
    document.getElementById('dash-content').innerHTML = `<div class="alert alert-error">${e.message}</div>`;
  }
}

// === 发起审批 ===
async function renderCreate(user) {
  const main = document.getElementById('main-content');
  main.innerHTML = `
    <p class="page-title">发起变更审批</p>
    <div id="alert" class="alert alert-error hidden"></div>
    <div class="card">
      <h3 style="margin-bottom:1rem">变更信息</h3>
      <div class="form-group">
        <label>变更标题 *</label>
        <input type="text" id="cr-title" placeholder="如：某分部工程钢筋型号替换变更">
      </div>
      <div class="grid-2">
        <div class="form-group">
          <label>变更类型</label>
          <select id="cr-type">
            <option value="设计变更">设计变更</option>
            <option value="施工变更">施工变更</option>
            <option value="材料替换">材料替换</option>
            <option value="其他">其他</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>变更说明</label>
        <textarea id="cr-desc" rows="4" placeholder="详细描述变更内容、原因、影响范围等"></textarea>
      </div>
    </div>

    <div class="card">
      <div class="flex-between mb-2">
        <h3>审批流程编排</h3>
        <button class="btn btn-outline btn-sm" onclick="addNode()">+ 添加节点</button>
      </div>
      <p class="text-muted text-sm mb-2">逐节点指定审批人或资料提交人，每个节点的人可以上传图纸、照片等资料辅助后续审批。</p>
      <div id="node-list" class="node-list"></div>
      <div id="node-empty" class="empty">点击"添加节点"开始编排审批流程</div>
    </div>

    <div class="card">
      <h3 style="margin-bottom:1rem">上传初始资料（选填）</h3>
      <input type="file" id="cr-file" multiple>
      <p class="text-muted text-sm mt-1">可上传变更方案、图纸、现场照片等，创建后也可在各节点补充</p>
    </div>

    <div class="flex gap-2">
      <button class="btn btn-primary" onclick="submitCreate()">提交发起</button>
      <button class="btn btn-gray" onclick="navigate('/dashboard')">取消</button>
    </div>
  `;

  // 加载用户列表供选择
  window._allUsers = [];
  try {
    const data = await API.get('/api/auth/users');
    window._allUsers = data.users;
  } catch(e) {}

  window._nodes = [];
  addNode(); // 默认添加第一个节点
}

function addNode() {
  window._nodes.push({
    node_type: 'approve',
    assignee_id: null,
    assignee_name: '',
    node_desc: ''
  });
  renderNodes();
}

function removeNode(idx) {
  window._nodes.splice(idx, 1);
  renderNodes();
}

function moveNode(idx, dir) {
  const arr = window._nodes;
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= arr.length) return;
  [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
  renderNodes();
}

function updateNode(idx, field, value) {
  window._nodes[idx][field] = value;
}

function pickUser(idx) {
  window._pickingNodeIdx = idx;
  const modal = document.getElementById('user-pick-modal');
  modal.classList.add('active');
  renderUserPickResults('');
}

function renderUserPickResults(keyword) {
  const users = window._allUsers || [];
  const filtered = keyword
    ? users.filter(u => u.name.includes(keyword) || u.org_name.includes(keyword) || (u.specialty || '').includes(keyword))
    : users;

  const grouped = {};
  filtered.forEach(u => {
    if (!grouped[u.org_type]) grouped[u.org_type] = [];
    grouped[u.org_type].push(u);
  });

  const html = Object.entries(grouped).map(([type, users]) => `
    <div style="padding:0.5rem 0.8rem;background:var(--gray-light);font-weight:600;font-size:0.8rem">${type}</div>
    ${users.map(u => `
      <div class="user-pick-item" onclick="selectUser(${u.id}, '${u.name} - ${u.org_type}(${u.org_name})')">
        <strong>${u.name}</strong> <span class="text-muted">${u.org_name}</span>
        <span class="badge badge-gray text-sm" style="margin-left:0.5rem">${u.specialty || ''}</span>
      </div>
    `).join('')}
  `).join('');

  document.getElementById('user-pick-results').innerHTML = html || '<div class="empty">未找到匹配用户</div>';
}

function selectUser(userId, userName) {
  const idx = window._pickingNodeIdx;
  window._nodes[idx].assignee_id = userId;
  window._nodes[idx].assignee_name = userName;
  document.getElementById('user-pick-modal').classList.remove('active');
  renderNodes();
}

function renderNodes() {
  const list = document.getElementById('node-list');
  const empty = document.getElementById('node-empty');
  const nodes = window._nodes;

  if (nodes.length === 0) {
    list.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  list.innerHTML = nodes.map((node, i) => `
    <div class="node-item">
      <div class="node-num">${i + 1}</div>
      <div class="node-body">
        <div class="grid-2" style="margin-bottom:0.5rem">
          <select class="form-group" style="padding:0.4rem;border:1px solid var(--gray-border);border-radius:4px" onchange="updateNode(${i}, 'node_type', this.value)">
            <option value="submit" ${node.node_type === 'submit' ? 'selected' : ''}>提交资料（上传文件，不审批）</option>
            <option value="approve" ${node.node_type === 'approve' ? 'selected' : ''}>审批（通过/退回/驳回）</option>
          </select>
          <div style="display:flex;align-items:center;gap:0.5rem">
            <input type="text" placeholder="选择处理人" value="${node.assignee_name}" readonly
              style="flex:1;padding:0.4rem 0.6rem;border:1px solid var(--gray-border);border-radius:4px;background:var(--white);cursor:pointer"
              onclick="pickUser(${i})">
          </div>
        </div>
        <input type="text" placeholder="节点说明（如：请审查变更方案合理性）" value="${node.node_desc}"
          style="width:100%;padding:0.4rem 0.6rem;border:1px solid var(--gray-border);border-radius:4px"
          oninput="updateNode(${i}, 'node_desc', this.value)">
      </div>
      <div class="flex-col gap-1">
        <span class="node-remove" onclick="removeNode(${i})" title="删除">×</span>
        ${i > 0 ? `<span class="text-sm" style="cursor:pointer;color:var(--primary)" onclick="moveNode(${i}, -1)" title="上移">↑</span>` : ''}
        ${i < nodes.length - 1 ? `<span class="text-sm" style="cursor:pointer;color:var(--primary)" onclick="moveNode(${i}, 1)" title="下移">↓</span>` : ''}
      </div>
    </div>
  `).join('');
}

async function submitCreate() {
  const title = document.getElementById('cr-title').value;
  const description = document.getElementById('cr-desc').value;
  const change_type = document.getElementById('cr-type').value;

  if (!title) return showAlert('请填写变更标题');

  const nodes = window._nodes;
  if (nodes.length === 0) return showAlert('请至少添加一个审批节点');

  for (let i = 0; i < nodes.length; i++) {
    if (!nodes[i].assignee_id) return showAlert(`第${i + 1}个节点未选择处理人`);
  }

  try {
    const data = await API.post('/api/approval/create', {
      title, description, change_type,
      workflow_config: nodes
    });

    // 上传初始文件
    const fileInput = document.getElementById('cr-file');
    if (fileInput.files.length > 0) {
      const formData = new FormData();
      formData.append('request_id', data.id);
      formData.append('description', '发起时上传');
      formData.append('file', fileInput.files[0]);
      try {
        await API.upload('/api/files/upload', formData);
      } catch(e) { console.error('文件上传失败', e); }
    }

    navigate('/detail/' + data.id);
  } catch (e) {
    showAlert(e.message);
  }
}

// === 审批详情 ===
async function renderDetail(id, user) {
  const main = document.getElementById('main-content');
  main.innerHTML = `<p class="page-title">审批详情</p><div id="detail-content">加载中...</div>`;

  try {
    const data = await API.get('/api/approval/detail/' + id);
    const r = data.request;
    const nodes = data.nodes;
    const records = data.records;
    const attachments = data.attachments;

    // 当前用户是否需要处理当前步骤
    const myPendingNode = nodes.find(n =>
      n.assignee_id === user.id
      && n.status === 'pending'
      && r.status === 'active'
      && n.node_index === r.current_node_index
    );

    let html = `
      <div id="alert" class="alert alert-error hidden"></div>

      ${r.status === 'rejected' ? `
        <div class="alert alert-danger" style="display:block">
          <strong>该审批单已被驳回，流程已终止。</strong>
          在第${r.current_node_index + 1}步被驳回，后续步骤不再处理。
          如需重新审批，请发起新的审批单。
        </div>
      ` : ''}

      ${r.status === 'approved' ? `
        <div class="alert alert-success" style="display:block">
          <strong>该审批单已全部通过，流程已完成。</strong>
        </div>
      ` : ''}

      <div class="card">
        <div class="flex-between">
          <div>
            <p class="page-title" style="margin:0">${r.title}</p>
            <p class="text-muted text-sm mt-1">
              发起人：${r.initiator_name}（${r.initiator_org_type} / ${r.initiator_org_name}）
              · 发起时间：${formatDate(r.created_at)}
            </p>
          </div>
          <div>${statusBadge(r.status)}</div>
        </div>
        ${r.change_type ? `<p class="mt-1"><span class="badge badge-teal">${r.change_type}</span></p>` : ''}
        ${r.description ? `<div class="mt-2" style="background:var(--gray-light);padding:1rem;border-radius:6px;white-space:pre-wrap">${r.description}</div>` : ''}
      </div>

      <!-- 审批流程 -->
      <div class="card">
        <h3 style="margin-bottom:1rem">审批流程</h3>
        <div class="timeline">
          ${nodes.map((n, i) => {
            // 计算节点的实际显示状态
            let displayStatus = n.status;
            let displayStatusLabel = n.status;
            let displayBadgeClass = 'badge-warning';

            // 如果审批单被驳回，且该节点在驳回节点之后且状态为pending，显示为"已取消"
            const isAfterRejected = (r.status === 'rejected' && n.node_index > r.current_node_index && n.status === 'pending');
            // 如果审批单已完成，且该节点在完成节点之后且状态为pending，显示为"已跳过"
            const isAfterCompleted = (r.status === 'approved' && n.node_index > r.current_node_index && n.status === 'pending');

            if (isAfterRejected) {
              displayStatus = 'cancelled';
              displayStatusLabel = '已取消';
              displayBadgeClass = 'badge-gray';
            } else if (isAfterCompleted) {
              displayStatus = 'skipped';
              displayStatusLabel = '已跳过';
              displayBadgeClass = 'badge-gray';
            } else if (n.status === 'approved') {
              displayStatusLabel = '已通过';
              displayBadgeClass = 'badge-success';
            } else if (n.status === 'pending') {
              displayStatusLabel = '待处理';
              displayBadgeClass = 'badge-warning';
            } else if (n.status === 'returned') {
              displayStatusLabel = '已退回';
              displayBadgeClass = 'badge-warning';
            } else if (n.status === 'rejected') {
              displayStatusLabel = '已驳回';
              displayBadgeClass = 'badge-danger';
            }

            return `
            <div class="timeline-item ${displayStatus} ${n.node_index === r.current_node_index && r.status === 'active' ? 'current' : ''}">
              <div class="flex-between">
                <div>
                  <strong>第${i + 1}步：${nodeTypeLabel(n.node_type)}</strong>
                  ${n.node_index === r.current_node_index && r.status === 'active' ? '<span class="badge badge-primary">当前</span>' : ''}
                  <span class="badge ${displayBadgeClass}">${displayStatusLabel}</span>
                </div>
                <div class="text-sm text-muted">${formatDate(n.updated_at)}</div>
              </div>
              <p class="text-sm mt-1">
                处理人：${n.assignee_name}（${n.assignee_org_type}）
                ${n.assignee_specialty ? `· ${n.assignee_specialty}` : ''}
              </p>
              ${n.node_desc ? `<p class="text-sm text-muted mt-1">说明：${n.node_desc}</p>` : ''}

              <!-- 该节点的附件 -->
              ${(() => {
                const nodeFiles = attachments.filter(a => a.node_id === n.id);
                if (nodeFiles.length === 0) return '';
                return `<div class="mt-1">
                  ${nodeFiles.map(a => `
                    <div class="flex-between text-sm" style="padding:0.3rem 0;border-bottom:1px solid var(--gray-border)">
                      <span>📎 ${a.original_name} <span class="text-muted">(${(a.file_size/1024).toFixed(0)}KB · ${a.uploader_name})</span></span>
                      <a href="/api/files/download/${a.id}" class="btn btn-outline btn-sm">下载</a>
                    </div>
                  `).join('')}
                </div>`;
              })()}

              <!-- 该节点的审批意见 -->
              ${(() => {
                const nodeRecords = records.filter(rec => rec.node_id === n.id);
                if (nodeRecords.length === 0) return '';
                return nodeRecords.map(rec => `
                  <div class="mt-1" style="padding:0.5rem;background:var(--gray-light);border-radius:4px">
                    <span class="badge ${rec.action === 'approve' ? 'badge-success' : rec.action === 'return' ? 'badge-warning' : rec.action === 'reject' ? 'badge-danger' : 'badge-gray'}">
                      ${rec.action === 'approve' ? '通过' : rec.action === 'return' ? '退回' : rec.action === 'reject' ? '驳回' : '提交'}
                    </span>
                    <span class="text-sm text-muted">${rec.user_name} · ${formatDate(rec.created_at)}</span>
                    ${rec.opinion ? `<p class="text-sm mt-1">${rec.opinion}</p>` : ''}
                  </div>
                `).join('');
              })()}
            </div>
          `}).join('')}
        </div>
      </div>

      <!-- 操作区 -->
      ${myPendingNode ? `
        <div class="card">
          <h3 style="margin-bottom:0.5rem">您的操作 <span class="text-muted text-sm">（当前是第${r.current_node_index + 1}步）</span></h3>
          <p class="text-muted text-sm" style="margin-bottom:1rem;padding:0.5rem;background:var(--gray-light);border-radius:4px">
            <strong>通过</strong>：批准当前步骤，流程自动流转到下一步<br>
            <strong>退回</strong>：退回到之前任意一步，流程回到该步重新处理，改完后继续往后走<br>
            <strong>驳回并删除</strong>：直接删除整个审批单及所有附件记录，不可恢复
          </p>
          <div class="form-group">
            <label>审批意见</label>
            <textarea id="opinion" rows="3" placeholder="请填写审批意见"></textarea>
          </div>
          <div class="form-group">
            <label>退回到哪一步</label>
            <select id="return-target" style="padding:0.4rem 0.6rem;border:1px solid var(--gray-border);border-radius:4px">
              ${nodes.filter(n => n.node_index < myPendingNode.node_index).map(n =>
                `<option value="${n.node_index}">第${n.node_index + 1}步：${n.assignee_name} - ${nodeTypeLabel(n.node_type)}${n.node_desc ? '（' + n.node_desc + '）' : ''}</option>`
              ).join('')}
            </select>
            <p class="text-muted text-sm">选择退回时使用，默认退回上一步</p>
          </div>
          <div class="form-group">
            <label>上传资料（可选）</label>
            <input type="file" id="node-file">
          </div>
          <div class="flex gap-2">
            <button class="btn btn-success" onclick="processNode(${myPendingNode.id}, 'approve')">通过</button>
            <button class="btn btn-warning" onclick="processNode(${myPendingNode.id}, 'return')">退回</button>
            <button class="btn btn-danger" onclick="processNode(${myPendingNode.id}, 'reject')">驳回并删除</button>
          </div>
        </div>
      ` : ''}

      <!-- 上传附件区 -->
      ${(r.status === 'active' || r.initiator_id === user.id) ? `
        <div class="card">
          <h3 style="margin-bottom:1rem">补充上传资料</h3>
          <div class="form-group">
            <label>选择文件</label>
            <input type="file" id="extra-file">
          </div>
          <div class="form-group">
            <label>文件说明</label>
            <input type="text" id="extra-desc" placeholder="如：变更方案补充图纸">
          </div>
          <button class="btn btn-primary btn-sm" onclick="uploadExtra(${id})">上传</button>
        </div>
      ` : ''}
    `;

    document.getElementById('detail-content').innerHTML = html;
  } catch (e) {
    document.getElementById('detail-content').innerHTML = `<div class="alert alert-error">${e.message}</div>`;
  }
}

async function processNode(nodeId, action) {
  const opinion = document.getElementById('opinion')?.value || '';
  const returnTarget = document.getElementById('return-target')?.value;

  // 驳回并删除需要二次确认
  if (action === 'reject') {
    if (!confirm('确定驳回并删除？该操作将删除整个审批单及所有附件记录，不可恢复。')) return;
  }
  // 退回需要确认
  if (action === 'return') {
    const targetSelect = document.getElementById('return-target');
    const targetText = targetSelect ? targetSelect.options[targetSelect.selectedIndex].text : '上一步';
    if (!confirm(`确定退回到${targetText}？`)) return;
  }

  // 先上传文件（如果有）
  const fileInput = document.getElementById('node-file');
  if (fileInput && fileInput.files.length > 0) {
    const requestId = window.location.hash.split('/detail/')[1];
    const formData = new FormData();
    formData.append('request_id', requestId);
    formData.append('node_id', nodeId);
    formData.append('description', opinion || '节点附件');
    formData.append('file', fileInput.files[0]);
    try {
      await API.upload('/api/files/upload', formData);
    } catch(e) { console.error('文件上传失败', e); }
  }

  try {
    const body = { action, opinion };
    if (action === 'return' && returnTarget !== undefined) {
      body.return_to_index = parseInt(returnTarget);
    }
    const result = await API.post(`/api/approval/process/${nodeId}`, body);
    if (result.deleted) {
      // 驳回并删除后，审批单已不存在，跳转回仪表盘
      navigate('/dashboard');
    } else {
      const id = window.location.hash.split('/detail/')[1];
      navigate('/detail/' + id);
    }
  } catch (e) {
    showAlert(e.message);
  }
}

async function uploadExtra(requestId) {
  const fileInput = document.getElementById('extra-file');
  const desc = document.getElementById('extra-desc').value;
  if (!fileInput.files.length) return showAlert('请选择文件');

  const formData = new FormData();
  formData.append('request_id', requestId);
  formData.append('description', desc);
  formData.append('file', fileInput.files[0]);

  try {
    await API.upload('/api/files/upload', formData);
    navigate('/detail/' + requestId);
  } catch (e) {
    showAlert(e.message);
  }
}

// === 待我处理 ===
async function renderMyTodos(user) {
  const main = document.getElementById('main-content');
  main.innerHTML = `<p class="page-title">待我处理</p><div id="todos-content">加载中...</div>`;

  try {
    const data = await API.get('/api/approval/my-todos');
    document.getElementById('todos-content').innerHTML = data.todos.length === 0
      ? '<div class="empty">暂无待办事项</div>'
      : `<div class="card"><div class="table-wrap"><table>
          <thead><tr><th>标题</th><th>变更类型</th><th>发起人</th><th>单位类型</th><th>当前步骤</th><th>节点说明</th><th>发起时间</th><th>操作</th></tr></thead>
          <tbody>
            ${data.todos.map(t => `
              <tr>
                <td><a href="javascript:navigate('/detail/${t.request_id}')">${t.title}</a></td>
                <td><span class="badge badge-teal">${t.change_type}</span></td>
                <td>${t.initiator_name}</td>
                <td>${t.initiator_org_type}</td>
                <td>第${t.current_node_index + 1}步</td>
                <td class="text-sm">${t.node_desc || ''}</td>
                <td class="text-sm">${formatDate(t.created_at)}</td>
                <td><button class="btn btn-primary btn-sm" onclick="navigate('/detail/${t.request_id}')">处理</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table></div></div>`;
  } catch(e) {
    document.getElementById('todos-content').innerHTML = `<div class="alert alert-error">${e.message}</div>`;
  }
}

// === 我发起的 ===
async function renderMyInitiated(user) {
  const main = document.getElementById('main-content');
  main.innerHTML = `<p class="page-title">我发起的审批</p><div id="init-content">加载中...</div>`;

  try {
    const data = await API.get('/api/approval/my-initiated');
    document.getElementById('init-content').innerHTML = data.requests.length === 0
      ? '<div class="empty">暂未发起过审批</div>'
      : `<div class="card"><div class="table-wrap"><table>
          <thead><tr><th>标题</th><th>类型</th><th>状态</th><th>当前步骤</th><th>总步骤</th><th>发起时间</th><th>操作</th></tr></thead>
          <tbody>
            ${data.requests.map(r => `
              <tr>
                <td><a href="javascript:navigate('/detail/${r.id}')">${r.title}</a></td>
                <td><span class="badge badge-teal">${r.change_type}</span></td>
                <td>${statusBadge(r.status)}</td>
                <td>${r.status === 'active' ? `第${r.current_node_index + 1}步` : '-'}</td>
                <td>${r.workflow_config.length}步</td>
                <td class="text-sm">${formatDate(r.created_at)}</td>
                <td><button class="btn btn-primary btn-sm" onclick="navigate('/detail/${r.id}')">查看</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table></div></div>`;
  } catch(e) {
    document.getElementById('init-content').innerHTML = `<div class="alert alert-error">${e.message}</div>`;
  }
}

// === 我已处理 ===
async function renderMyProcessed(user) {
  const main = document.getElementById('main-content');
  main.innerHTML = `<p class="page-title">我已处理的审批</p><div id="proc-content">加载中...</div>`;

  try {
    const data = await API.get('/api/approval/my-processed');
    document.getElementById('proc-content').innerHTML = data.requests.length === 0
      ? '<div class="empty">暂无已处理记录</div>'
      : `<div class="card"><div class="table-wrap"><table>
          <thead><tr><th>标题</th><th>类型</th><th>状态</th><th>发起人</th><th>处理时间</th><th>操作</th></tr></thead>
          <tbody>
            ${data.requests.map(r => `
              <tr>
                <td><a href="javascript:navigate('/detail/${r.id}')">${r.title}</a></td>
                <td><span class="badge badge-teal">${r.change_type}</span></td>
                <td>${statusBadge(r.status)}</td>
                <td>${r.initiator_name}</td>
                <td class="text-sm">${formatDate(r.updated_at)}</td>
                <td><button class="btn btn-primary btn-sm" onclick="navigate('/detail/${r.id}')">查看</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table></div></div>`;
  } catch(e) {
    document.getElementById('proc-content').innerHTML = `<div class="alert alert-error">${e.message}</div>`;
  }
}

// === 全部审批（所有用户可见） ===
async function renderAllApprovals(user) {
  const main = document.getElementById('main-content');
  main.innerHTML = `
    <p class="page-title">全部审批</p>
    <div class="flex-between mb-2">
      <p class="text-muted text-sm">所有审批单均可查看详情</p>
      <div class="flex gap-2">
        <button class="btn btn-outline btn-sm" onclick="window.open('/api/approval/export', '_blank')">导出四维智能表格</button>
      </div>
    </div>
    <div class="card">
      <div class="flex gap-2 mb-2" style="flex-wrap:wrap">
        <input type="text" id="search-keyword" placeholder="搜索标题/发起人" style="flex:1;min-width:200px;padding:0.4rem 0.6rem;border:1px solid var(--gray-border);border-radius:4px" oninput="filterApprovals()">
        <select id="filter-status" style="padding:0.4rem 0.6rem;border:1px solid var(--gray-border);border-radius:4px" onchange="filterApprovals()">
          <option value="">全部状态</option>
          <option value="active">流转中</option>
          <option value="approved">已通过</option>
        </select>
        <select id="filter-org" style="padding:0.4rem 0.6rem;border:1px solid var(--gray-border);border-radius:4px" onchange="filterApprovals()">
          <option value="">全部单位</option>
          <option value="建设单位">建设</option>
          <option value="代建单位">代建</option>
          <option value="设计单位">设计</option>
          <option value="监理单位">监理</option>
          <option value="施工单位">施工</option>
        </select>
      </div>
      <div id="all-content">加载中...</div>
    </div>
  `;

  window._allApprovals = [];

  try {
    const data = await API.get('/api/approval/all');
    window._allApprovals = data.requests;
    renderApprovalTable(data.requests);
  } catch(e) {
    document.getElementById('all-content').innerHTML = `<div class="alert alert-error">${e.message}</div>`;
  }
}

function renderApprovalTable(requests) {
  const content = document.getElementById('all-content');
  if (requests.length === 0) {
    content.innerHTML = '<div class="empty">暂无审批单</div>';
    return;
  }
  content.innerHTML = `<div class="table-wrap"><table>
    <thead><tr><th>序号</th><th>标题</th><th>类型</th><th>发起人</th><th>单位类型</th><th>单位名称</th><th>状态</th><th>当前步骤</th><th>发起时间</th><th>操作</th></tr></thead>
    <tbody>
      ${requests.map((r, i) => `
        <tr>
          <td class="text-center">${i + 1}</td>
          <td><a href="javascript:navigate('/detail/${r.id}')">${r.title}</a></td>
          <td><span class="badge badge-teal">${r.change_type}</span></td>
          <td>${r.initiator_name}</td>
          <td>${r.initiator_org_type}</td>
          <td class="text-sm">${r.initiator_org_name || '-'}</td>
          <td>${statusBadge(r.status)}</td>
          <td>${r.status === 'active' ? `第${r.current_node_index + 1}/${r.workflow_config.length}步` : `${r.workflow_config.length}步`}</td>
          <td class="text-sm">${formatDate(r.created_at)}</td>
          <td><button class="btn btn-primary btn-sm" onclick="navigate('/detail/${r.id}')">查看</button></td>
        </tr>
      `).join('')}
    </tbody>
  </table></div>`;
}

function filterApprovals() {
  const keyword = (document.getElementById('search-keyword')?.value || '').toLowerCase();
  const status = document.getElementById('filter-status')?.value || '';
  const org = document.getElementById('filter-org')?.value || '';

  let filtered = window._allApprovals || [];

  if (keyword) {
    filtered = filtered.filter(r =>
      (r.title || '').toLowerCase().includes(keyword) ||
      (r.initiator_name || '').toLowerCase().includes(keyword)
    );
  }
  if (status) {
    filtered = filtered.filter(r => r.status === status);
  }
  if (org) {
    filtered = filtered.filter(r => r.initiator_org_type === org);
  }

  renderApprovalTable(filtered);
}

// === 管理后台 ===
async function renderAdmin(user) {
  if (user.role !== 'admin') {
    document.getElementById('main-content').innerHTML = '<div class="alert alert-error">无权访问</div>';
    return;
  }

  const main = document.getElementById('main-content');
  main.innerHTML = `
    <p class="page-title">管理后台</p>
    <div class="tabs">
      <div class="tab active" onclick="adminTab('pending')">待审核用户</div>
      <div class="tab" onclick="adminTab('all')">全部用户</div>
      <div class="tab" onclick="adminTab('all-requests')">全部审批单</div>
    </div>
    <div id="admin-content"></div>
  `;
  adminTab('pending');
}

async function adminTab(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  event && event.target && event.target.classList.add('active');
  const content = document.getElementById('admin-content');
  content.innerHTML = '加载中...';

  try {
    if (tab === 'pending') {
      const data = await API.get('/api/auth/admin/pending');
      content.innerHTML = data.users.length === 0
        ? '<div class="empty">暂无待审核用户</div>'
        : `<div class="card"><div class="table-wrap"><table>
            <thead><tr><th>姓名</th><th>手机号</th><th>单位类型</th><th>单位名称</th><th>专业</th><th>岗位</th><th>注册时间</th><th>操作</th></tr></thead>
            <tbody>
              ${data.users.map(u => `
                <tr>
                  <td>${u.name}</td>
                  <td>${u.phone}</td>
                  <td>${u.org_type}</td>
                  <td>${u.org_name}</td>
                  <td>${u.specialty || '-'}</td>
                  <td>${u.position || '-'}</td>
                  <td class="text-sm">${formatDate(u.created_at)}</td>
                  <td>
                    <button class="btn btn-success btn-sm" onclick="reviewUser(${u.id}, 'approve')">通过</button>
                    <button class="btn btn-danger btn-sm" onclick="reviewUser(${u.id}, 'reject')">驳回</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table></div></div>`;
    } else if (tab === 'all') {
      const data = await API.get('/api/auth/admin/users');
      content.innerHTML = `<div class="card"><div class="table-wrap"><table>
          <thead><tr><th>姓名</th><th>手机号</th><th>单位类型</th><th>单位名称</th><th>专业</th><th>角色</th><th>状态</th><th>操作</th></tr></thead>
          <tbody>
            ${data.users.map(u => `
              <tr>
                <td>${u.name}</td>
                <td>${u.phone}</td>
                <td>${u.org_type}</td>
                <td>${u.org_name}</td>
                <td>${u.specialty || '-'}</td>
                <td>${u.role === 'admin' ? '<span class="badge badge-primary">管理员</span>' : '<span class="badge badge-gray">用户</span>'}</td>
                <td>${u.status === 'approved' ? '<span class="badge badge-success">正常</span>' : u.status === 'pending' ? '<span class="badge badge-warning">待审核</span>' : '<span class="badge badge-danger">禁用</span>'}</td>
                <td>${u.role !== 'admin' ? `<button class="btn ${u.status === 'disabled' ? 'btn-success' : 'btn-warning'} btn-sm" onclick="toggleUser(${u.id})">${u.status === 'disabled' ? '启用' : '禁用'}</button>` : '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table></div></div>`;
    } else if (tab === 'all-requests') {
      const data = await API.get('/api/approval/all');
      content.innerHTML = data.requests.length === 0
        ? '<div class="empty">暂无审批单</div>'
        : `<div class="card"><div class="table-wrap"><table>
            <thead><tr><th>标题</th><th>类型</th><th>发起人</th><th>单位</th><th>状态</th><th>步骤</th><th>发起时间</th><th>操作</th></tr></thead>
            <tbody>
              ${data.requests.map(r => `
                <tr>
                  <td><a href="javascript:navigate('/detail/${r.id}')">${r.title}</a></td>
                  <td><span class="badge badge-teal">${r.change_type}</span></td>
                  <td>${r.initiator_name}</td>
                  <td>${r.initiator_org_type}</td>
                  <td>${statusBadge(r.status)}</td>
                  <td>${r.status === 'active' ? `第${r.current_node_index + 1}/${r.workflow_config.length}步` : `${r.workflow_config.length}步`}</td>
                  <td class="text-sm">${formatDate(r.created_at)}</td>
                  <td><button class="btn btn-primary btn-sm" onclick="navigate('/detail/${r.id}')">查看</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table></div></div>`;
    }
  } catch(e) {
    content.innerHTML = `<div class="alert alert-error">${e.message}</div>`;
  }
}

async function reviewUser(id, action) {
  try {
    await API.post(`/api/auth/admin/review/${id}`, { action });
    adminTab('pending');
  } catch(e) {
    alert(e.message);
  }
}

async function toggleUser(id) {
  try {
    await API.post(`/api/auth/admin/toggle-status/${id}`, {});
    adminTab('all');
  } catch(e) {
    alert(e.message);
  }
}

// === 全局模态框 ===
function ensureModal() {
  if (document.getElementById('user-pick-modal')) return;
  const modal = document.createElement('div');
  modal.id = 'user-pick-modal';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal">
      <div class="flex-between mb-2">
        <h2>选择处理人</h2>
        <span class="node-remove" onclick="document.getElementById('user-pick-modal').classList.remove('active')">×</span>
      </div>
      <input type="text" placeholder="搜索姓名/单位/专业" oninput="renderUserPickResults(this.value)"
        style="width:100%;padding:0.5rem;border:1px solid var(--gray-border);border-radius:6px;margin-bottom:0.5rem">
      <div id="user-pick-results" class="user-pick-results"></div>
    </div>
  `;
  document.body.appendChild(modal);
}

// === 启动 ===
window.addEventListener('hashchange', render);
window.addEventListener('DOMContentLoaded', () => {
  ensureModal();
  render();
});
