# Google Sheet / Apps Script cho quản lý trang thiết bị

## Cách dùng

1. Dùng file thiết bị:
   `https://docs.google.com/spreadsheets/d/1fwwIwXpCqhCZzaitYs2__hzfuTNW7mcGAvKl3y_hqZ0/edit?gid=281087352`
2. Dùng file Users:
   `https://docs.google.com/spreadsheets/d/10yRv_RD5ersJzD9xd-UDkZ8-hoiHxRBW6bz71qtMqoQ/edit?gid=1113591284`
3. Vào `Extensions > Apps Script` trong file thiết bị, dán nội dung `Code.gs`.
4. Chạy hàm `setupSheets` một lần để tạo các sheet chuẩn trong file thiết bị.
5. Vào `Project Settings > Script Properties`, thêm `SESSION_SECRET` là một chuỗi ngẫu nhiên dài tối thiểu 32 ký tự.
6. Chạy hàm `migrateLegacyDevices` một lần để chuyển dữ liệu Excel gốc sang sheet `Devices` nếu cần import dữ liệu cũ.
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

## API chính

- `GET ?action=getDevices`
- `POST { action: "login", payload: { username, pin } }`
- `POST { action: "getUsers", payload: { sessionToken } }` - Admin
- `POST { action: "getRepairs", payload: { sessionToken } }`
- `POST { action: "getTransfers", payload: { sessionToken } }`
- `GET ?action=getDepartments`
- `POST { action: "reportRepair", payload: { sessionToken, deviceId, description } }`
- `POST { action: "approveRepair", payload: { sessionToken, rowId, deviceId, newStatus, note } }` - Admin
- `POST { action: "createTransfer", payload: { sessionToken, deviceId, toDepartment, reason, note } }`
- `POST { action: "receiveTransfer" | "rejectTransfer" | "cancelTransfer", payload: { sessionToken, transferId, note, reason } }`
- `POST { action: "addGSP", payload: { sessionToken, shift, tempKho, tempTuLanh, humidity, note } }`
- `POST { action: "migrateLegacyDevices", payload: { sessionToken } }` - Admin

Các action ghi dữ liệu không tin `actorUsername`, `approver`, `recorder`, `userName`, `userEmail` từ frontend. Script lấy lại người thao tác từ `sessionToken` để tránh giả mạo quyền bằng DevTools/localStorage.

## File dữ liệu đang cấu hình

Trong `Code.gs`:

- `DEVICE_SPREADSHEET_ID = 1fwwIwXpCqhCZzaitYs2__hzfuTNW7mcGAvKl3y_hqZ0`
- `LEGACY_DEVICE_SHEET_GID = 281087352`
- `USERS_SPREADSHEET_ID = 10yRv_RD5ersJzD9xd-UDkZ8-hoiHxRBW6bz71qtMqoQ`
- `USERS_SHEET_GID = 1113591284`

## Luân chuyển thiết bị

Khi gọi `transferDevice`, script sẽ:

1. Tìm thiết bị theo `id` hoặc `Seri Máy`.
2. Cập nhật `Nơi đặt thiết bị` trong sheet `Devices`.
3. Ghi một dòng lịch sử vào sheet `Transfers`.

Việc này giữ danh mục thiết bị luôn ở khoa/phòng hiện tại, đồng thời vẫn truy vết được quá trình luân chuyển.
