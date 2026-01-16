<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Quản lý Khoa Dược</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <script type="text/javascript" src="https://www.gstatic.com/charts/loader.js"></script>
    <script src='https://cdn.jsdelivr.net/npm/fullcalendar@6.1.8/index.global.min.js'></script>
    
    <style>
        :root { --primary-color: #0f9d58; --bg-color: #f0f2f5; }
        body { background-color: var(--bg-color); font-family: 'Segoe UI', sans-serif; font-size: 14px; }
        .nav-pills .nav-link.active { background-color: var(--primary-color); color: white; box-shadow: 0 4px 6px rgba(15, 157, 88, 0.3); }
        .nav-pills .nav-link { color: #555; font-weight: 600; cursor: pointer;}
        .card-custom { border: none; box-shadow: 0 5px 15px rgba(0,0,0,0.05); border-radius: 12px; background: white; }
        .badge-status { font-size: 0.85rem; padding: 6px 12px; border-radius: 20px; }
        .bg-todo { background-color: #dc3545; color: white; } .bg-doing { background-color: #ffc107; color: #333; } .bg-done { background-color: #198754; color: white; }
        .disabled-control { pointer-events: none; opacity: 0.5; filter: grayscale(100%); }
        .admin-only, .logged-only { display: none !important; }
        .range-slider { width: 100%; cursor: pointer; height: 8px; accent-color: var(--primary-color); }
        .btn-action { font-size: 0.8rem; font-weight: 500; padding: 4px 8px; width: 100%; text-align: left; margin-bottom: 4px; border-radius: 4px; border: none; transition: 0.2s; }
        .btn-email { background-color: #fff3cd; color: #856404; } .btn-email:hover { background-color: #ffeeba; }
        .deadline-extended { color: #dc3545; font-weight: bold; }
        .deadline-original { text-decoration: line-through; color: #999; font-size: 0.85em; display: block; }
        .dropdown-menu-custom { max-height: 300px; overflow-y: auto; width: 100%; padding: 0; }
        .group-header { background-color: #e9ecef; padding: 6px 15px; font-weight: bold; color: #495057; font-size: 0.85rem; border-bottom: 1px solid #ddd; }
        .form-check { padding: 8px 15px 8px 40px; margin: 0; cursor: pointer; border-bottom: 1px solid #f8f9fa; }
        .form-check:hover { background-color: #f1f3f5; }
        .form-check-input { cursor: pointer; transform: scale(1.2); margin-left: -25px; }
        #hiddenAssigneeSelect { display: none; }
        
        /* Style cho loại công việc */
        .type-routine { border-left: 4px solid #adb5bd; }
        .type-deadline { border-left: 4px solid #dc3545; background-color: #fffbfb; }
        .group-tag { font-size: 0.75rem; background: #e9ecef; padding: 2px 6px; border-radius: 4px; color: #495057; display: inline-block; margin-top: 2px; }
    </style>
</head>
<body>

<div class="container-fluid px-4 py-4">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <h3 class="text-success fw-bold m-0">🏥 QUẢN LÝ KHOA DƯỢC</h3>
        <div>
            <span id="userDisplay" class="me-2 fw-bold text-primary"></span>
            <button class="btn btn-outline-secondary btn-sm d-none me-1" id="btnChangePin" onclick="showChangePinModal()">🔐 Đổi PIN</button>
            <button class="btn btn-outline-dark btn-sm" id="btnLogin" onclick="showLoginModal()">👤 Đăng nhập</button>
            <button class="btn btn-outline-danger btn-sm d-none" id="btnLogout" onclick="logout()">🚪 Thoát</button>
        </div>
    </div>

    <ul class="nav nav-pills nav-fill mb-4 bg-white p-2 rounded shadow-sm" id="pills-tab" role="tablist">
        <li class="nav-item admin-only"><button class="nav-link" data-bs-toggle="pill" data-bs-target="#pills-input">📝 Giao Việc</button></li>
        <li class="nav-item admin-only"><button class="nav-link" data-bs-toggle="pill" data-bs-target="#pills-compliance">⚖️ Nội Quy</button></li>
        <li class="nav-item"><button class="nav-link active" data-bs-toggle="pill" data-bs-target="#pills-list" onclick="loadTaskList()">📋 Danh Sách</button></li>
        <li class="nav-item"><button class="nav-link" data-bs-toggle="pill" data-bs-target="#pills-report" onclick="loadDashboard()">📊 Báo Cáo</button></li>
    </ul>

    <div class="tab-content">
        <!-- TAB GIAO VIỆC -->
        <div class="tab-pane fade" id="pills-input">
            <div class="container" style="max-width: 900px;">
                <div class="card card-custom p-4">
                    <form id="taskForm">
                        <div class="mb-3"><label class="fw-bold">Tên công việc</label><input type="text" class="form-control" name="taskName" required></div>
                        
                        <!-- CHỌN NGƯỜI LÀM -->
                        <div class="mb-3">
                            <label class="fw-bold">Người thực hiện</label>
                            <select name="assignee" id="hiddenAssigneeSelect" multiple></select>
                            <div class="dropdown">
                                <button class="btn btn-outline-secondary w-100 text-start d-flex justify-content-between" type="button" id="dropdownMenuButton" data-bs-toggle="dropdown" aria-expanded="false" data-bs-auto-close="outside">
                                    <span id="selectedText">-- Chọn nhân sự --</span><span class="badge bg-success rounded-pill" id="selectedCount">0</span>
                                </button>
                                <div class="dropdown-menu dropdown-menu-custom shadow" id="checkboxContainer"></div>
                            </div>
                        </div>

                        <!-- CHỌN TỔ & PHÂN LOẠI -->
                        <div class="row">
                            <div class="col-md-6 mb-3">
                                <label class="fw-bold">Thuộc Tổ/Bộ phận</label>
                                <select class="form-select" name="group" id="groupSelect">
                                    <!-- Sẽ được thêm tự động từ JS -->
                                </select>
                            </div>
                            <div class="col-md-6 mb-3">
                                <label class="fw-bold">Phân loại công việc</label>
                                <select class="form-select" name="taskType">
                                    <option value="Thường quy" selected>🟦 Công việc Thường quy</option>
                                    <option value="Có hạn">🟥 Công việc Có hạn (Deadline)</option>
                                </select>
                            </div>
                        </div>

                        <div class="row">
                            <div class="col-md-6 mb-3"><label class="fw-bold">Mức độ Ưu tiên</label><select class="form-select" name="priority"><option value="P1">🔴 Cao</option><option value="P2" selected>🟡 Trung bình</option><option value="P3">🟢 Thấp</option></select></div>
                            <div class="col-md-6 mb-3"><label class="fw-bold">Deadline (Hạn chót)</label><input type="date" class="form-control" name="deadline" required></div>
                        </div>

                        <div class="mb-3"><textarea class="form-control" name="notes" rows="2" placeholder="Ghi chú chi tiết..."></textarea></div>
                        
                        <button type="submit" class="btn btn-success w-100 fw-bold" id="submitBtn">💾 LƯU CÔNG VIỆC</button>
                    </form>
                </div>
            </div>
        </div>

        <!-- TAB DANH SÁCH -->
        <div class="tab-pane fade show active" id="pills-list">
            <div class="card card-custom p-4">
                <div class="row g-2 mb-3">
                    <div class="col-md-3"><select id="filterAssignee" class="form-select form-select-sm" onchange="renderTable()"><option value="">NV: Tất cả</option></select></div>
                    <div class="col-md-3"><select id="filterStatus" class="form-select form-select-sm" onchange="renderTable()"><option value="">TT: Tất cả</option><option value="Todo">Todo (Chưa xong)</option><option value="Done">Done (Xong)</option></select></div>
                    <div class="col-md-3"><input type="text" id="filterText" class="form-control form-control-sm" placeholder="Tìm tên việc..." onkeyup="renderTable()"></div>
                    
                    <!-- Nút Gửi Email Đồng Loạt -->
                    <div class="col-md-3 d-flex gap-1">
                        <button class="btn btn-warning btn-sm fw-bold w-100 admin-only" onclick="triggerBulkEmail()" title="Gửi mail cho tất cả việc chưa xong">📧 Gửi mail loạt</button>
                        <button class="btn btn-primary btn-sm w-50" onclick="loadTaskList()">🔄 Tải</button>
                    </div>
                </div>
                <div class="table-responsive">
                    <table class="table table-hover align-middle border">
                        <thead class="table-success">
                            <tr>
                                <th width="30%">Công việc / Tổ</th>
                                <th width="20%">Tiến độ</th>
                                <th width="15%">Người làm</th>
                                <th width="10%">Deadline</th>
                                <th width="10%">Trạng thái</th>
                                <th width="10%">Hành động</th>
                            </tr>
                        </thead>
                        <tbody id="taskTableBody"></tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- TAB NỘI QUY -->
        <div class="tab-pane fade" id="pills-compliance">
             <div class="row g-4">
                <div class="col-md-4">
                    <div class="card card-custom p-3 h-100">
                        <h5 class="text-danger fw-bold text-center">⚖️ Ghi nhận Vi phạm/Khen</h5>
                        <form id="complianceForm">
                            <div class="mb-2"><label class="fw-bold small">Nhân viên</label><select class="form-select" name="person" id="compliancePerson" required></select></div>
                            <div class="mb-2"><label class="fw-bold small">Loại</label><select class="form-select" name="type" required><option value="Vi phạm">⚠️ Vi phạm</option><option value="Khen thưởng">🏆 Khen thưởng</option></select></div>
                            <div class="mb-2"><label class="fw-bold small">Nội dung</label><textarea class="form-control" name="fault" rows="3" required></textarea></div>
                            <div class="mb-3"><label class="fw-bold small">Ghi chú</label><input type="text" class="form-control" name="note"></div>
                            <button type="submit" class="btn btn-danger w-100" id="btnCompliance">Lưu ghi nhận</button>
                        </form>
                    </div>
                </div>
                <div class="col-md-8">
                    <div class="card card-custom p-3 h-100">
                        <div class="d-flex justify-content-between mb-3"><h5 class="fw-bold text-secondary">📜 Lịch sử</h5><button class="btn btn-sm btn-outline-secondary" onclick="loadCompliance()">🔄 Tải lại</button></div>
                        <div class="table-responsive"><table class="table table-sm table-striped"><thead class="table-light"><tr><th>Ngày</th><th>Nhân viên</th><th>Loại</th><th>Nội dung</th><th>Ghi chú</th></tr></thead><tbody id="complianceBody"></tbody></table></div>
                    </div>
                </div>
            </div>
        </div>

        <!-- TAB BÁO CÁO -->
        <div class="tab-pane fade" id="pills-report">
             <div class="row g-4 mb-4">
                <div class="col-md-6"><div class="card card-custom p-3 h-100"><h6 class="text-center fw-bold text-secondary">📊 Tỉ lệ hoàn thành</h6><div id="piechart_task" style="height:300px;"></div></div></div>
                <div class="col-md-6"><div class="card card-custom p-3 h-100"><h6 class="text-center fw-bold text-secondary">📈 Số lượng công việc</h6><div id="barchart_task" style="height:300px;"></div></div></div>
            </div>
            <div class="row g-4 mb-4">
                <div class="col-md-6"><div class="card card-custom p-3 h-100"><h6 class="text-center fw-bold text-danger">⚠️ Vi phạm</h6><div id="columnchart_violation" style="height:300px;"></div></div></div>
                <div class="col-md-6"><div class="card card-custom p-3 h-100"><h6 class="text-center fw-bold text-warning">🏆 Khen thưởng</h6><div id="columnchart_reward" style="height:300px;"></div></div></div>
            </div>
            <div class="card card-custom p-4"><h5 class="text-success fw-bold mb-3">📅 LỊCH TỔNG HỢP</h5><div id="calendar"></div></div>
        </div>
    </div>
</div>

<!-- Login & Pin Modals -->
<div class="modal fade" id="loginModal" tabindex="-1"><div class="modal-dialog"><div class="modal-content"><div class="modal-header"><h5 class="modal-title">🔐 Đăng nhập</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div><div class="modal-body">
    <div class="mb-3"><label class="fw-bold">Tên đăng nhập:</label><input type="text" id="loginUsername" class="form-control" placeholder="Ví dụ: thuongpb"></div>
    <div class="mb-3"><label class="fw-bold">Mã PIN:</label><input type="password" id="loginPin" class="form-control" placeholder="Nhập PIN..."></div>
</div><div class="modal-footer"><button type="button" class="btn btn-primary w-100" onclick="performLogin()">Đăng nhập</button></div></div></div></div>

<div class="modal fade" id="changePinModal" tabindex="-1"><div class="modal-dialog"><div class="modal-content"><div class="modal-header"><h5 class="modal-title">🔐 Đổi Mã PIN</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div><div class="modal-body"><div class="mb-3"><label class="fw-bold">PIN Cũ:</label><input type="password" id="oldPin" class="form-control"></div><div class="mb-3"><label class="fw-bold">PIN Mới:</label><input type="password" id="newPin" class="form-control"></div><div class="mb-3"><label class="fw-bold">Nhập lại PIN Mới:</label><input type="password" id="confirmPin" class="form-control"></div></div><div class="modal-footer"><button type="button" class="btn btn-success w-100" onclick="submitChangePin()">Xác nhận Đổi</button></div></div></div></div>

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>

<script>
    const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwICEe7-T7vampGrDJCLaKHUvRu8DyaKGbv1KByaeEvr4sATP00cWALX56JOzgXxggYHw/exec"; // ⚠️ Nhớ update link mới sau khi Deploy
    let globalData = [], currentUser = null;

    // --- DANH SÁCH TỔ VÀ NHÂN VIÊN ---
    const STAFF_GROUPS = {
        "Ban Lãnh Đạo": ["Nguyễn Thị Hương Giang - Trưởng Khoa", "Trần Thị Huyền Trang - Phó Khoa"],
        "Tổ Lâm Sàng": ["Phạm Bá Thương", "Lê Thị Thanh Nhàn", "Chu Đài Trang"],
        "Tổ Kho": ["Nguyễn Duy Tiến", "Nguyễn Thị Hằng", "Kiều Mạnh Toàn", "Đỗ Thị Nhật Lệ"],
        "Tổ Nghiệp Vụ": ["Nguyễn Thị Thu Hà", "Hà Thị Thảo", "Nguyễn Tuấn Thành"],
        "Nhà Thuốc": ["Vũ Thị Hồng Hạnh", "Hà Thu Trang", "Đoàn Thị Mai Hương", "Triệu Thị Vỵ"]
    };

    initUI(); loadTaskList(); checkSession();

    function initUI() { 
        initCheckboxes(); 
        initSingleSelect('compliancePerson');
        initGroupSelect(); // Khởi tạo dropdown chọn tổ
    }
    
    // Tạo dropdown chọn Tổ cho form Giao việc
    function initGroupSelect() {
        const s = document.getElementById('groupSelect');
        s.innerHTML = '<option value="">-- Chọn tổ --</option>';
        Object.keys(STAFF_GROUPS).forEach(group => {
            s.innerHTML += `<option value="${group}">${group}</option>`;
        });
    }

    // --- CÁC HÀM LOGIN / PIN ---
    function showLoginModal() { new bootstrap.Modal(document.getElementById('loginModal')).show(); }
    function performLogin() {
        const username = document.getElementById('loginUsername').value;
        const pin = document.getElementById('loginPin').value;
        if(!username || !pin) return alert("Thiếu thông tin!");
        fetch(SCRIPT_URL + "?action=login", { method: 'POST', body: JSON.stringify({ username, pin }) })
        .then(r => r.json()).then(res => {
            if(res.status === 'success') {
                currentUser = { username: res.username, name: res.name, role: res.role };
                sessionStorage.setItem('user', JSON.stringify(currentUser));
                applyLoginState();
                bootstrap.Modal.getInstance(document.getElementById('loginModal')).hide();
                alert(`🔓 Xin chào ${res.name}`);
                loadTaskList();
            } else alert("⛔ " + res.message);
        });
    }
    function logout() { sessionStorage.removeItem('user'); currentUser = null; applyLoginState(); location.reload(); }
    function checkSession() { const saved = sessionStorage.getItem('user'); if(saved) { currentUser = JSON.parse(saved); applyLoginState(); } }
    function applyLoginState() {
        const isLoggedIn = !!currentUser;
        document.getElementById('btnLogin').classList.toggle('d-none', isLoggedIn);
        document.getElementById('btnLogout').classList.toggle('d-none', !isLoggedIn);
        document.getElementById('btnChangePin').classList.toggle('d-none', !isLoggedIn);
        document.getElementById('userDisplay').innerText = isLoggedIn ? `👤 ${currentUser.name}` : "";
        const isAdmin = currentUser && currentUser.role === 'Admin';
        document.querySelectorAll('.admin-only').forEach(el => el.style.setProperty("display", isAdmin ? "block" : "none", "important"));
    }
    function showChangePinModal() { new bootstrap.Modal(document.getElementById('changePinModal')).show(); }
    function submitChangePin() {
        const oldPin = document.getElementById('oldPin').value, newPin = document.getElementById('newPin').value, confirmPin = document.getElementById('confirmPin').value;
        if(!oldPin || !newPin) return alert("Thiếu thông tin!");
        if(newPin !== confirmPin) return alert("PIN mới không khớp!");
        fetch(SCRIPT_URL + "?action=change_pin", { method: 'POST', body: JSON.stringify({ username: currentUser.username, oldPin, newPin }) })
        .then(r => r.json()).then(res => { alert(res.message); if(res.status === 'success') { bootstrap.Modal.getInstance(document.getElementById('changePinModal')).hide(); logout(); } });
    }

    // --- RENDER TABLE (SẮP XẾP THÔNG MINH) ---
    function renderTable() {
        const tb = document.getElementById('taskTableBody'); tb.innerHTML="";
        const fN = document.getElementById('filterAssignee').value.toLowerCase().trim();
        const fS = document.getElementById('filterStatus').value;
        const fT = document.getElementById('filterText').value.toLowerCase().trim();
        
        let flt = globalData.filter(r => {
            let as = String(r[7]).toLowerCase(), st = String(r[2]).trim(), nm = String(r[1]).toLowerCase();
            return (fN === "" || as.includes(fN)) && (fS === "" || st.toLowerCase() === fS.toLowerCase()) && (fT === "" || nm.includes(fT));
        });
        
        // 🔥 LOGIC SẮP XẾP THÔNG MINH:
        // 1. Việc "Done" (Hoàn thành) luôn nằm dưới cùng.
        // 2. Việc chưa xong (Todo/Doing) nằm trên.
        // 3. Trong nhóm chưa xong: Sắp xếp theo Deadline TĂNG DẦN (Gần đến hạn lên đầu).
        flt.sort((a, b) => {
            const statusA = String(a[2]).trim(), statusB = String(b[2]).trim();
            const doneA = statusA === 'Done', doneB = statusB === 'Done';
            
            // Nếu một cái xong, một cái chưa -> Cái xong đẩy xuống dưới
            if (doneA && !doneB) return 1; 
            if (!doneA && doneB) return -1;
            
            // Nếu cả hai cùng trạng thái (cùng xong hoặc cùng chưa xong) -> So sánh Deadline
            // Cột 9 là gia hạn, Cột 4 là deadline gốc. Ưu tiên gia hạn.
            const dateA = new Date(a[9] || a[4] || '9999-12-31');
            const dateB = new Date(b[9] || b[4] || '9999-12-31');
            return dateA - dateB; // Ngày gần hơn lên trước
        });
        
        flt.forEach(r => {
            let id = r[0], name = r[1], status = String(r[2]).trim(), assignee = r[7];
            let type = r[10] || "Thường quy"; // Cột 10: Phân loại
            let group = r[11] || ""; // Cột 11: Tổ
            let dlRaw = r[9] || r[4], dlDisp = dlRaw ? new Date(dlRaw).toLocaleDateString('vi-VN') : '';
            let prog = parseProgress(r[8]);

            let isOwner = false;
            if (currentUser) { if (currentUser.role === 'Admin') isOwner = true; else if (assignee.includes(currentUser.name)) isOwner = true; }
            let disableClass = isOwner ? "" : "disabled-control";

            // Giao diện
            let typeClass = type === 'Có hạn' ? 'type-deadline' : 'type-routine';
            let typeBadge = type === 'Có hạn' ? '<span class="badge bg-danger ms-1">🔥 Deadline</span>' : '<span class="badge bg-secondary ms-1">Thường quy</span>';
            let groupBadge = group ? `<div class="group-tag">🏢 ${group}</div>` : '';

            let slider = status === 'Done' 
                ? `<div class="progress" style="height:20px"><div class="progress-bar bg-success" style="width:100%">100%</div></div>` 
                : `<div class="d-flex align-items-center ${disableClass}"><input type="range" class="range-slider me-2" min="0" max="100" step="10" value="${prog}" onchange="updateProgress('${id}',this.value)"><span class="badge bg-secondary" id="val-${id}" style="min-width:35px">${prog}%</span></div>`;
            
            let badgeCls = status === 'Done' ? 'bg-done' : (status === 'Doing' ? 'bg-doing' : 'bg-todo');
            let btnDone = status !== 'Done' ? `<button class="btn btn-sm btn-outline-success mb-1 w-100 ${disableClass}" onclick="markDone('${id}')">✅ Xong</button>` : '';
            let btnMail = status !== 'Done' ? `<button class="btn btn-action btn-email ${disableClass}" onclick="sendEmailBackend('${id}','${name}','${assignee}','${dlRaw}')">📧 Nhắc</button>` : '';
            
            tb.innerHTML += `
            <tr class="${typeClass}">
                <td>
                    <span class="fw-bold text-primary">${name}</span>${typeBadge}<br>
                    ${groupBadge}<br>
                    <small class="text-muted">${r[5] || ''}</small>
                </td>
                <td>${slider}</td>
                <td><small class="fw-bold">${assignee}</small></td>
                <td class="${checkOverdue(dlRaw, status)}">${dlDisp}</td>
                <td><span class="badge badge-status ${badgeCls}">${status}</span></td>
                <td>${btnDone}${btnMail}</td>
            </tr>`;
        });
    }
    
    function checkOverdue(d, s) {
        if (!d || s === 'Done') return "";
        return new Date(d) < new Date() ? "text-danger fw-bold" : "";
    }

    // --- ACTIONS ---
    function updateProgress(id, v) { if(!currentUser) return alert("Vui lòng đăng nhập!"); document.getElementById(`val-${id}`).innerText=v+'%'; fetch(SCRIPT_URL+"?action=update_progress",{method:'POST',body:JSON.stringify({id:id,progress:v, user_fullname: currentUser.name, role: currentUser.role})}).then(r=>r.json()).then(res=>{if(res.status==='error'){alert(res.message); loadTaskList();} else if(v==100)loadTaskList()}); }
    function markDone(id) { if(!currentUser) return alert("Vui lòng đăng nhập!"); if(confirm('Xong chưa?')) fetch(SCRIPT_URL+"?action=update",{method:'POST',body:JSON.stringify({id:id, user_fullname: currentUser.name, role: currentUser.role})}).then(r=>r.json()).then(res=>{alert(res.message);loadTaskList()}); }
    function parseProgress(val) { if(!val)return 0; let s=String(val).replace(/^'/,'').replace('%','').trim(); let n=parseFloat(s); return isNaN(n)?0:(n<=1&&n>0&&s.includes('.')?Math.round(n*100):Math.round(n)); }
    function loadTaskList() { document.getElementById('taskTableBody').innerHTML='<tr><td colspan="7" class="text-center py-5"><div class="spinner-border text-success"></div></td></tr>'; fetch(SCRIPT_URL).then(r=>r.json()).then(res=>{ globalData=res.data; populateFilter(); renderTable(); }); }
    function populateFilter() { const s=document.getElementById('filterAssignee'); let a=[]; globalData.forEach(r=>a.push(...String(r[7]).split(',').map(v=>v.trim()).filter(v=>v))); [...new Set(a)].sort().forEach(n=>s.innerHTML+=`<option value="${n}">${n}</option>`); }
    function sendEmailBackend(id,t,p,d){ if(!confirm(`Gửi mail cho ${p}?`))return; let dl=d?new Date(d).toLocaleDateString('vi-VN'):'Som nhat'; const btn=event.target; const txt=btn.innerText; btn.innerText="⏳..."; btn.disabled=true; fetch(SCRIPT_URL+"?action=send_email_manual",{method:'POST',body:JSON.stringify({taskName:t,assignee:p,deadline:dl})}).then(r=>r.json()).then(res=>{alert(res.message)}).finally(()=>{btn.innerText=txt;btn.disabled=false}); }
    
    // 🔥 HÀM GỬI EMAIL ĐỒNG LOẠT
    function triggerBulkEmail() {
        if(!currentUser || currentUser.role !== 'Admin') return alert("⛔ Chỉ Admin mới dùng được tính năng này!");
        
        const pendingTasks = globalData.filter(r => String(r[2]).trim() !== 'Done');
        const taskIds = pendingTasks.map(r => r[0]);
        
        if (taskIds.length === 0) return alert("Không có công việc nào cần gửi!");
        if (!confirm(`Bạn có chắc muốn gửi email nhắc nhở cho ${taskIds.length} đầu việc đang dở dang không?`)) return;
        
        const btn = event.target;
        const originalText = btn.innerText;
        btn.innerText = "⏳ Đang gửi...";
        btn.disabled = true;

        fetch(SCRIPT_URL + "?action=send_bulk_email", {
            method: 'POST',
            body: JSON.stringify({ taskIds: taskIds, sender: currentUser.name })
        })
        .then(r => r.json())
        .then(res => alert(res.message))
        .catch(err => alert("Lỗi: " + err))
        .finally(() => {
            btn.innerText = originalText;
            btn.disabled = false;
        });
    }

    // --- FORMS ---
    document.getElementById('taskForm').addEventListener('submit', e => { 
        e.preventDefault(); 
        if(!currentUser||currentUser.role!=='Admin'){alert("⛔ Chỉ Admin!");return;} 
        const btn=document.getElementById('submitBtn'); btn.disabled=true; 
        const d=Object.fromEntries(new FormData(e.target).entries()); 
        d.assignee=Array.from(document.getElementById('hiddenAssigneeSelect').selectedOptions).map(o=>o.value).join(', '); 
        d.role=currentUser.role; 
        fetch(SCRIPT_URL+"?action=add",{method:'POST',body:JSON.stringify(d)})
        .then(r=>r.json())
        .then(res=>{ alert(res.message); if(res.status==='success'){e.target.reset(); document.querySelectorAll('#checkboxContainer input').forEach(c=>c.checked=false); updateDisplay(document.getElementById('hiddenAssigneeSelect'),document.getElementById('selectedText'),document.getElementById('selectedCount')); document.querySelector('[data-bs-target="#pills-list"]').click(); loadTaskList();} })
        .finally(()=>{btn.disabled=false;}); 
    });
    
    document.getElementById('complianceForm').addEventListener('submit', e => { e.preventDefault(); if(!currentUser||currentUser.role!=='Admin'){alert("⛔ Chỉ Admin!");return;} const btn=document.getElementById('btnCompliance'); btn.disabled=true; const d=Object.fromEntries(new FormData(e.target).entries()); d.role=currentUser.role; fetch(SCRIPT_URL+"?action=add_compliance",{method:'POST',body:JSON.stringify(d)}).then(r=>r.json()).then(res=>{ alert(res.message); if(res.status==='success'){e.target.reset(); loadCompliance();} }).finally(()=>{btn.disabled=false;}); });

    function initCheckboxes() { const c=document.getElementById('checkboxContainer'),h=document.getElementById('hiddenAssigneeSelect'),t=document.getElementById('selectedText'),n=document.getElementById('selectedCount'); c.innerHTML=""; let i=0; for(const[g,ppl] of Object.entries(STAFF_GROUPS)){ c.innerHTML+=`<div class="group-header">${g}</div>`; ppl.forEach(name=>{ h.add(new Option(name,name)); const d=document.createElement('div'); d.className='form-check'; d.innerHTML=`<input class="form-check-input" type="checkbox" value="${name}" id="chk${i}"><label class="form-check-label" for="chk${i}">${name}</label>`; c.appendChild(d); const ci=i; d.querySelector('input').addEventListener('change',(e)=>{h.options[ci].selected=e.target.checked; updateDisplay(h,t,n);}); i++; }); } }
    function initSingleSelect(elId) { const s=document.getElementById(elId); s.innerHTML='<option value="">-- Chọn --</option>'; for(const[g,ppl] of Object.entries(STAFF_GROUPS)){ const o=document.createElement('optgroup'); o.label=g; ppl.forEach(n=>o.innerHTML+=`<option value="${n}">${n}</option>`); s.appendChild(o); } }
    function updateDisplay(s,t,c){let cnt=0,nm=[]; Array.from(s.options).forEach(o=>{if(o.selected){cnt++;nm.push(o.value)}});c.innerText=cnt;t.innerText=cnt===0?"-- Chọn nhân sự --":(cnt<=2?nm.join(", "):`Đã chọn ${cnt} người`);}

    function loadCompliance(){const tb=document.getElementById('complianceBody');tb.innerHTML='<tr><td colspan="5" class="text-center">Loading...</td></tr>'; fetch(SCRIPT_URL+"?action=read_compliance").then(r=>r.json()).then(res=>{ tb.innerHTML=""; if(!res.data||!res.data.length){tb.innerHTML='<tr><td colspan="5" class="text-center text-muted">Trống</td></tr>';return;} res.data.reverse().forEach(r=>{ let h=r.length>=6,t=h?r[3]:(r[3].includes("Khen")?"Khen thưởng":"Vi phạm"),c=h?r[4]:r[3],n=h?r[5]:r[4],b=t.includes("Khen")?'<span class="badge bg-warning text-dark">🏆 Khen</span>':'<span class="badge bg-danger">⚠️ Vi phạm</span>'; tb.innerHTML+=`<tr><td>${new Date(r[1]).toLocaleDateString('vi-VN')}</td><td class="fw-bold">${r[2]}</td><td>${b}</td><td>${c}</td><td>${n||''}</td></tr>`; }); }); }
    google.charts.load('current',{'packages':['corechart','bar']});
    
    function loadDashboard() { if(SCRIPT_URL.includes("DÁN_LINK")) return; Promise.all([fetch(SCRIPT_URL).then(r=>r.json()), fetch(SCRIPT_URL+"?action=read_compliance").then(r=>r.json())]).then(([taskRes, compRes]) => { drawCharts(taskRes.data||[], compRes.data||[]); renderCal(taskRes.data||[], compRes.data||[]); }); }
    function drawCharts(t,c) { 
        var s={'Todo':0,'Doing':0,'Done':0},p={}; t.forEach(r=>{s[String(r[2]).trim()]++; String(r[7]).split(',').forEach(n=>{n=n.trim();if(n){if(!p[n])p[n]=0;p[n]++;}});}); 
        new google.visualization.PieChart(document.getElementById('piechart_task')).draw(google.visualization.arrayToDataTable([['S','C'],['Todo',s.Todo],['Doing',s.Doing],['Done',s.Done]]),{colors:['#dc3545','#ffc107','#198754'],is3D:true,legend:'bottom',chartArea:{width:'90%',height:'80%'}}); 
        var arr=[['NV','Việc',{role:'style'}]]; Object.keys(p).sort().forEach(k=>arr.push([k,p[k],'#0d6efd'])); 
        new google.visualization.ColumnChart(document.getElementById('barchart_task')).draw(google.visualization.arrayToDataTable(arr),{legend:'none',chartArea:{width:'85%',height:'70%'}}); 
        var pc={}; c.forEach(r=>{let n=r[2],h=r.length>=6,tp=h?r[3]:(r[3].includes("Khen")?"Khen":"Vi phạm");if(!pc[n])pc[n]=0;if(!tp.includes("Khen"))pc[n]++;}); 
        var ac=[['NV','Vi phạm',{role:"style"}]]; Object.keys(pc).sort().forEach(k=>{if(pc[k]>0)ac.push([k,pc[k],'#dc3545']);}); 
        if(ac.length>1) new google.visualization.ColumnChart(document.getElementById('columnchart_violation')).draw(google.visualization.arrayToDataTable(ac),{legend:'none',chartArea:{width:'85%',height:'70%'}}); else document.getElementById('columnchart_violation').innerHTML="<div class='text-center mt-5 text-muted'>Chưa có vi phạm!</div>";
        var pr={}; c.forEach(r=>{let n=r[2],h=r.length>=6,tp=h?r[3]:(r[3].includes("Khen")?"Khen":"Vi phạm");if(!pr[n])pr[n]=0;if(tp.includes("Khen"))pr[n]++;}); 
        var ar=[['NV','Khen thưởng',{role:"style"}]]; Object.keys(pr).sort().forEach(k=>{if(pr[k]>0)ar.push([k,pr[k],'#ffc107']);}); 
        if(ar.length>1) new google.visualization.ColumnChart(document.getElementById('columnchart_reward')).draw(google.visualization.arrayToDataTable(ar),{legend:'none',chartArea:{width:'85%',height:'70%'}}); else document.getElementById('columnchart_reward').innerHTML="<div class='text-center mt-5 text-muted'>Chưa có khen thưởng!</div>";
    }
    
    function renderCal(t,c) { var ev=[]; t.forEach(r=>{let d=r[9]||r[4];if(!d)return;ev.push({title:`${r[1]} (${r[7]})`,start:new Date(d).toISOString().split('T')[0],color:r[2]==='Done'?'#198754':(r[2]==='Todo'?'#dc3545':'#ffc107'),textColor:r[2]==='Doing'?'black':'white',extendedProps:{description:r[5]||'Không có ghi chú'}});}); c.forEach(r=>{if(!r[1])return;let h=r.length>=6,tp=h?r[3]:(r[3].includes("Khen")?"Khen":"Vi phạm"),ib=tp.includes("Khen"),ct=h?r[4]:r[3];ev.push({title:ib?`🏆 ${r[2]}`:`⚠️ ${r[2]}`,start:new Date(r[1]).toISOString().split('T')[0],color:ib?'#fd7e14':'#212529',textColor:'white',description:ct});}); var cal=new FullCalendar.Calendar(document.getElementById('calendar'),{initialView:'dayGridMonth',locale:'vi',height:'85vh',headerToolbar:{left:'prev,next today',center:'title',right:'dayGridMonth,listMonth'},events:ev,eventClick:function(i){alert('📌 '+i.event.title+'\nℹ️ '+(i.event.extendedProps.description||'Deadline'));}}); cal.render(); setTimeout(()=>cal.updateSize(),200); }
</script>
</body>
</html>
