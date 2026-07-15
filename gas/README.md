# Google Sheet / Apps Script cho quản lý trang thiết bị

## Cách dùng

1. Dùng file thiết bị:
   `https://docs.google.com/spreadsheets/d/1fwwIwXpCqhCZzaitYs2__hzfuTNW7mcGAvKl3y_hqZ0/edit?gid=281087352`
2. Dùng file Users:
   `https://docs.google.com/spreadsheets/d/10yRv_RD5ersJzD9xd-UDkZ8-hoiHxRBW6bz71qtMqoQ/edit?gid=1113591284`
3. Vào `Extensions > Apps Script` trong file thiết bị, dán nội dung `Code.gs`.
4. Chạy hàm `setupSheets` một lần để tạo các sheet chuẩn trong file thiết bị.
5. Vào `Project Settings > Script Properties`, thêm hai chuỗi ngẫu nhiên độc lập, mỗi chuỗi dài tối thiểu 32 ký tự:
   - `SESSION_SECRET`: ký và xác minh phiên đăng nhập.
   - `PIN_PEPPER`: băm và xác minh PIN.
   Script từ chối đăng nhập nếu một trong hai thuộc tính thiếu hoặc quá ngắn; không có secret dự phòng.
6. Nếu cần nạp snapshot ban đầu, cấu hình `QLTTB_IMPORT_USERNAME` và `QLTTB_IMPORT_PIN`, rồi chạy `npm run import:snapshot`. Script gọi action Admin `importSnapshotDevices`; không ghi thông tin đăng nhập thật vào mã nguồn.
7. Deploy Apps Script dạng `Web app`:
   - Execute as: `Me`
   - Who has access: tùy môi trường, thường chọn `Anyone with the link` nếu app tĩnh gọi trực tiếp.
8. Lấy URL `/exec` sau khi deploy và cập nhật endpoint mặc định trong `src/services/api.ts` nếu đổi deployment.

## Sheet được tạo

- `Devices`: danh mục thiết bị chuẩn hóa từ file Excel.
- `Users`: không tạo trong file thiết bị; script đọc từ file Users riêng theo ID ở trên.
- `Repairs`: phiếu báo hỏng/sửa chữa.
- `Transfers`: lịch sử luân chuyển thiết bị giữa các khoa/phòng.
- `GSP`: nhật ký nhiệt độ/độ ẩm kho nếu dùng màn GSP hiện có.
- `InventoryRuns`: danh mục các đợt kiểm kê dùng chung; mỗi đợt có một sheet chi tiết `KK - ...`.
- `OperationalWorkflows`: trạng thái và ghi chú quy trình hồ sơ dùng chung.
- `CostEntries`: chi phí bảo trì/sửa chữa dùng chung.
- `Documents`: hồ sơ kiểm định/đăng kiểm của thiết bị.
- `ActivityLogs`: nhật ký các thao tác ghi quan trọng.

## API chính

- `POST { action: "login", payload: { username, pin } }`
- `POST { action: "getDevices", payload: { sessionToken } }`
- `POST { action: "getDepartments", payload: { sessionToken } }`
- `POST { action: "getUsers", payload: { sessionToken } }` - Admin
- `POST { action: "getRepairs", payload: { sessionToken } }`
- `POST { action: "getTransfers", payload: { sessionToken } }`
- `POST { action: "getOperationalState", payload: { sessionToken } }`
- `POST { action: "saveWorkflowOverride", payload: { sessionToken, taskKey, status, note } }` - Admin
- `POST { action: "addCostEntry", payload: { sessionToken, id, deviceId, date, amount, category, vendor, note } }` - Admin
- `POST { action: "deleteCostEntry", payload: { sessionToken, id } }` - Admin
- `POST { action: "getInventoryRuns", payload: { sessionToken } }`
- `POST { action: "reportRepair", payload: { sessionToken, deviceId, description } }`
- `POST { action: "approveRepair", payload: { sessionToken, rowId, deviceId, newStatus, note } }` - Admin
- `POST { action: "createTransfer", payload: { sessionToken, deviceId, toDepartment, reason, note } }`
- `POST { action: "receiveTransfer" | "rejectTransfer" | "cancelTransfer", payload: { sessionToken, transferId, note, reason } }`
- `POST { action: "addGSP", payload: { sessionToken, shift, tempKho, tempTuLanh, humidity, note } }`
- `POST { action: "importSnapshotDevices", payload: { sessionToken, devices } }` - Admin

Không có endpoint danh mục thiết bị/khoa phòng công khai. Các action ghi dữ liệu không tin `actorUsername`, `approver`, `recorder`, `userName`, `userEmail` từ frontend. Script lấy lại người thao tác từ `sessionToken` để tránh giả mạo quyền bằng DevTools/localStorage.

Người dùng thường chỉ đọc phiếu sửa chữa gắn với tên đăng nhập bất biến của mình hoặc thuộc khoa/phòng của mình, và phiếu luân chuyển mà tên đăng nhập của mình tham gia hoặc có khoa nguồn/đích trùng khoa của mình. Email/họ tên không được dùng để cấp quyền. Admin đọc toàn bộ.

Người dùng thường chỉ được tự đổi PIN. Họ tên, email, khoa/phòng, vai trò và trạng thái tài khoản do Admin quản lý. Backend bỏ qua và ghi log nếu tài khoản thường cố sửa các trường hồ sơ được bảo vệ.

Người dùng đã đăng nhập có thể tạo đợt kiểm kê. Sau khi tạo, chỉ chính tên đăng nhập tạo đợt hoặc Admin được sửa/xóa; tên người tạo lấy từ phiên, không lấy từ payload. Khi xóa, script bắt buộc tìm thấy `runId` trong `InventoryRuns` và chỉ dùng tên sheet đã lưu trong registry.

PIN mới được lưu dạng hash HMAC có salt và dùng `PIN_PEPPER` làm pepper. Khi một tài khoản cũ đăng nhập đúng bằng PIN dạng văn bản, script thay ngay giá trị đó bằng hash trong đúng cột PIN/mật khẩu hiện có. Sau 5 lần nhập sai trong 15 phút, tài khoản bị tạm khóa trong phần thời gian còn lại của cửa sổ này.

Có thể xoay `SESSION_SECRET` mà không làm hỏng hash PIN; mọi phiên cũ sẽ hết hiệu lực. Không xoay `PIN_PEPPER` nếu chưa có kế hoạch đặt lại hoặc băm lại toàn bộ PIN. Khi nâng cấp từ bản từng dùng `SESSION_SECRET` làm pepper, đặt `PIN_PEPPER` ban đầu bằng giá trị `SESSION_SECRET` hiện tại để giữ các hash đã có, sau đó mới xoay riêng `SESSION_SECRET`.

## File dữ liệu đang cấu hình

Trong `Code.gs`:

- `DEVICE_SPREADSHEET_ID = 1fwwIwXpCqhCZzaitYs2__hzfuTNW7mcGAvKl3y_hqZ0`
- `USERS_SPREADSHEET_ID = 10yRv_RD5ersJzD9xd-UDkZ8-hoiHxRBW6bz71qtMqoQ`
- `USERS_SHEET_GID = 1113591284`

## Luân chuyển thiết bị

Khi gọi `transferDevice`, script sẽ:

1. Tìm thiết bị theo `id` hoặc `Seri Máy`.
2. Ghi phiếu vào `Transfers` với trạng thái `PENDING_RECEIVE`; chưa đổi khoa/phòng của thiết bị.
3. Chờ tài khoản thuộc khoa nhận hoặc Admin gọi `receiveTransfer`.
4. Chỉ khi nhận thành công, cập nhật `Nơi đặt thiết bị` trong `Devices` và chuyển phiếu sang `COMPLETED`.

Nếu phiếu bị từ chối hoặc hủy, khoa/phòng hiện tại trong `Devices` không thay đổi. Luồng này giữ danh mục đúng cho đến khi bên nhận xác nhận bàn giao.
