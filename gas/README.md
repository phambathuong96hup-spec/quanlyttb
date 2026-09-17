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

## Chính sách bảo vệ dữ liệu tệp Drive (Uploads & Minh chứng)

Hệ thống quản lý tệp minh chứng sửa chữa/luân chuyển và tài liệu kiểm định tuân theo nguyên tắc **quyền tối thiểu (Least Privilege)**:

### 1. Cấu hình quyền qua Script Properties
- `DRIVE_SHARING_POLICY`:
  - `PRIVATE` (Mặc định khi không cấu hình): Tệp mới không cấp link xem công khai internet (`ANYONE_WITH_LINK`). Quyền truy cập được kế thừa hoặc quản lý qua tài khoản Google được cấp phép.
  - `DOMAIN_WITH_LINK`: Chỉ người dùng trong cùng tên miền Google Workspace của đơn vị có link mới xem được.
  - Giá trị khác dùng chính sách PRIVATE; không hỗ trợ mở tệp công khai bằng cấu hình này.
- Kiểm tra quyền luôn bật, không phụ thuộc `DRIVE_STRICT_PRIVATE`. Không dùng thuộc tính này để bỏ qua kiểm tra.

### 2. Cấp quyền cho đơn vị/khoa phòng xem tệp hợp lệ
- Thay vì cấp quyền công khai trên từng tệp, quản trị viên Google Workspace của bệnh viện/đơn vị cần chia sẻ thư mục gốc (`HinhAnhMinhChung`, `Tài liệu kiểm định` hoặc thư mục cha chứa Spreadsheet) cho:
  - Google Group của cán bộ/nhân viên: ví dụ `nhanvien-ttb@domain.vn` (quyền `Viewer`).
  - Google Group của Phòng Vật tư Thiết bị / Ban Quản lý: ví dụ `phong-vttb@domain.vn` (quyền `Editor` hoặc `Content Manager`).
- Khi người dùng đăng nhập bằng tài khoản nội bộ của đơn vị truy cập link tệp từ hệ thống, Google Drive sẽ xác thực quyền qua Group mà không cần mở link công khai ra toàn internet.
- Khi upload thất bại trước bước ghi phiếu, script cố gắng dọn tệp bằng `setTrashed` và ghi log nếu dọn thất bại. Nếu bước ghi phiếu có kết quả chưa xác định, giữ minh chứng để đối soát; không tự động mở rộng quyền chia sẻ.

### 3. Quy trình rà soát và thu hồi liên kết công khai của tệp cũ
Đối với các tệp đã upload trong giai đoạn trước:
1. Chạy kịch bản đối soát (audit script) liệt kê các tệp trong thư mục có `getSharingAccess() === DriveApp.Access.ANYONE_WITH_LINK`.
2. Kiểm tra danh sách tệp được liệt kê và các biểu mẫu/phiếu đang liên kết.
3. Thực hiện thu hồi liên kết công khai bằng cách chuyển quyền về `DriveApp.Access.PRIVATE` (hoặc `DOMAIN_WITH_LINK`), đảm bảo nhóm nội bộ đã được cấp quyền ở cấp thư mục trước khi thu hồi để không làm gián đoạn công việc của người dùng hợp lệ.
4. Không chạy thay đổi trực tiếp trên Drive môi trường thật mà không có kế hoạch bảo trì được phê duyệt.

### 4. Giới hạn Shared Drive (Bộ nhớ dùng chung) & Kiểm tra thư mục tổ tiên
- **Fail-closed:** Thư mục đích và tất cả thư mục cha/tổ tiên (ancestors) phải ở trạng thái Restricted/Private. Nếu bất kỳ cấp nào mở chia sẻ công khai (`ANYONE_WITH_LINK` / `ANYONE`), thao tác upload sẽ bị từ chối và ném lỗi ngay lập tức.
- **Giới hạn đã kiểm thử:** Bản này dùng DriveApp và chưa kiểm thử quyền kế thừa trên Shared Drive. Chỉ triển khai với thư mục My Drive đã kiểm tra quyền; mọi lỗi đọc quyền phải chặn upload. Không coi kiểm thử giả lập là bằng chứng về quyền trên Drive thật.

## Cài đặt Time-driven Trigger cho Đối soát Tự động

Để hệ thống tự động xử lý hàng đợi đồng bộ (`PendingSync`) ngầm định kỳ:
1. Mở file Spreadsheet chứa hệ thống, chọn **Extensions > Apps Script**.
2. Chọn biểu tượng **Triggers** (hình đồng hồ bấm giờ ở menu bên trái) > Nhấn nút **Add Trigger** (Thêm trình kích hoạt).
3. Cấu hình trigger:
   - **Choose which function to run:** `triggerReconcilePendingSyncs`
   - **Choose which deployment should run:** `Head`
   - **Select event source:** `Time-driven` (Theo thời gian)
   - **Select type of time based trigger:** `Minutes timer` (hoặc `Hour timer`)
   - **Select minute interval:** `Every 15 minutes` (hoặc `Every 30 minutes`)
   - **Failure notification settings:** `Notify me immediately` hoặc `daily`.
4. Nhấn **Save**. Trigger sẽ chạy độc lập, tự động khóa và đối soát từng tác vụ trong sheet `PendingSync`, đồng bộ trạng thái vật lý và trạng thái tổng hợp của thiết bị mà không tạo trùng phiếu hay gửi email lặp lại.

## Phạm vi và cơ chế Idempotency (Chống trùng lặp giao dịch)

- **Phạm vi bảo vệ:**
  - Đã triển khai đầy đủ cho các thao tác biến đổi nghiệp vụ cốt lõi: `reportRepair`, `createTransfer`, `createTransferTypeRequest`.
  - Hỗ trợ cho `addDocument`, `renewDocument` khi client truyền kèm `requestId`.
- **Cơ chế hoạt động:**
  - Client sinh `requestId` duy nhất cho mỗi phiên giao dịch.
  - Backend sử dụng khóa ngắn (`withDeviceMutationLock_`) ghi nhận trạng thái `PROCESSING` trước khi thực thi callback, sau đó giải phóng khóa để chạy nghiệp vụ tránh nested deadlock.
  - Khi hoàn thành (kể cả kết quả `success: false` do quy tắc nghiệp vụ), biên nhận JSON được lưu nguyên vẹn với trạng thái `COMPLETED` để replay chính xác khi retry.
  - Nếu callback throw ngoại lệ hoặc tiến trình bị đứt quãng, giao dịch được đánh dấu `UNKNOWN`. Khi retry, hệ thống đối soát theo `RequestId` trong bảng `Repairs` / `Transfers`:
    - Nếu đã có dòng dữ liệu: Khôi phục biên nhận và trả kết quả đã lưu (`idempotentReplay: true`), không bao giờ chạy lại callback.
    - Nếu chưa chứng minh được: Trả lỗi `UNCERTAIN_STATE` an toàn (fail-closed), tuyệt đối không tự ý chạy lại sau timeout để triệt tiêu nguy cơ nhân đôi dữ liệu.

## Kho mẫu và phiếu nghiệp vụ

Tính năng mới tại **Mẫu và phiếu** dùng kho riêng, không áp dụng chính sách chia sẻ nhóm của thư mục minh chứng ở trên. Bắt buộc cấu hình `FORM_VAULT_FOLDER_ID`, bật dịch vụ Drive API v3 (`Drive`) và giữ kho chỉ chủ sở hữu truy cập. Người dùng tải qua API được phân quyền theo người gửi; admin xem tất cả. Hướng dẫn đầy đủ: [Mẫu và phiếu](../docs/mau-va-phieu.md).
