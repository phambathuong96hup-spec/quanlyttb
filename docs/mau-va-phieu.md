# Mẫu và phiếu: hướng dẫn sử dụng và triển khai

## Người sử dụng

Mở **Mẫu và phiếu** trong thanh điều hướng (điện thoại: **Thêm → Mẫu và phiếu**).

- Chọn Luân chuyển, Sửa chữa hoặc Mua sắm.
- Nhấn **Tải mẫu** để lấy mẫu do admin đăng.
- Điền trên máy, nhấn **Sử dụng mẫu**, nhập tiêu đề và tải tệp hoàn thành lên.
- Mục **Phiếu tôi đã gửi** cho phép tìm và tải lại phiếu của chính tài khoản đang đăng nhập.
- Nhận PDF, DOCX, XLSX, tối đa 8 MB mỗi tệp. Chưa hỗ trợ điền mẫu trực tuyến hoặc xuất phiếu tự động.

## Admin

- Mở **Quản lý mẫu** tại loại phiếu tương ứng để đăng mẫu có sẵn.
- **Thay thế** tạo phiên bản mới; bản cũ không còn nhận phiếu mới.
- **Xóa mẫu** có bước xác nhận, ngừng hiển thị mẫu để sử dụng. Tệp mẫu cũ và phiếu đã gửi vẫn được lưu cho lịch sử.
- **Tất cả phiếu đã gửi** liệt kê phiếu của mọi tài khoản theo loại đang chọn; có thể tìm bằng tiêu đề, người gửi hoặc khoa/phòng.
- Mỗi phiếu giữ TemplateId của phiên bản đã dùng, người gửi lấy từ phiên xác thực, khoa/phòng, thời điểm và tên tệp.

Đây là kho mẫu và phiếu đính kèm. Gửi tệp tại đây không tự tạo yêu cầu điều chuyển thiết bị, cập nhật trạng thái sửa chữa hoặc phê duyệt mua sắm trong các luồng nghiệp vụ khác.

## Cấu hình trước khi triển khai

1. Tài khoản triển khai GAS tạo một thư mục riêng trong **My Drive**, ví dụ `QLTTB_MauVaPhieu`. Thư mục và toàn bộ thư mục cha chỉ có chủ sở hữu truy cập, không cấp quyền cho nhóm nhân viên, domain hoặc anyone. Không dùng lại thư mục minh chứng đang chia sẻ chung.
2. Trong Apps Script, thêm dịch vụ **Drive API v3**, identifier **Drive**. Dự án Google Cloud tiêu chuẩn có thể cần bật Google Drive API tương ứng. Xem hướng dẫn chính thức: https://developers.google.com/apps-script/guides/services/advanced
3. Trong Script Properties, đặt `FORM_VAULT_FOLDER_ID` bằng ID của thư mục vừa tạo. Không đưa ID này vào frontend.
4. Triển khai GAS chạy dưới tài khoản sở hữu kho phiếu, rồi phát hành frontend tương ứng. Backend tự tạo hai tab `FormTemplates` và `SubmittedForms` trong Spreadsheet thiết bị khi dùng tính năng. Sao lưu Spreadsheet trước khi nâng cấp.
5. Kiểm thử staging với hai tài khoản thường và một admin: admin đăng/thay/xóa mẫu; A gửi phiếu, B không thấy và không tải được phiếu A; admin thấy cả hai. Kiểm tra Drive thực tế có tệp riêng tư.
6. Không chia sẻ Spreadsheet chứa dữ liệu hệ thống hoặc kho Drive cho người dùng thường. Quyền admin trong ứng dụng không đòi hỏi chia sẻ Drive trực tiếp: tệp được tải qua API đã kiểm tra quyền.

Việc kiểm tra quyền dùng cả DriveApp và danh sách Permissions của Drive API v3 để phát hiện quyền nhóm/kế thừa. Nếu chưa cấu hình hoặc không đọc được quyền, backend từ chối upload. API không trả link Drive hoặc FileId trong danh sách; thao tác tải chỉ nhận ID hồ sơ rồi kiểm tra lại người gửi/admin ở server.

## Khôi phục và giới hạn

- Upload/submit dùng requestId và IdempotencyKeys; retry cùng nội dung không tạo thêm phiếu. Không xóa biên nhận UNKNOWN để ép chạy lại.
- Nếu Sheets báo lỗi sau khi có thể đã ghi dòng, giữ tệp riêng tư. Quản trị viên đối chiếu RequestId trong hai tab với IdempotencyKeys. Nếu có dòng, backend có đường khôi phục kết quả mà không upload lại.
- Nếu lỗi xảy ra trước khi lưu được dòng, có thể còn tệp riêng tư cần admin kiểm tra trong kho; không tự xóa khi kết quả ghi chưa rõ.
- Kiểm tra định dạng gồm loại tệp, kích thước và chữ ký đầu tệp; không phải công cụ quét mã độc hay xác minh nội dung người dùng đã điền đúng mẫu.
- Quyền của chủ sở hữu Google Drive/Spreadsheet vẫn nằm ngoài phân quyền ứng dụng. Không cấp các quyền trực tiếp này cho người dùng thường.
- Hiện chưa cấu hình hay tác động Google Drive/Sheets thật. Kiểm thử tự động dùng dịch vụ giả lập; cần kiểm thử staging sau cấu hình.

## Kiểm tra local ngày 15/09/2026

- 175/175 unit và contract tests đạt, gồm phân quyền, giả mạo người gửi, mẫu hết hiệu lực, kiểm tra quyền nhóm Drive, khôi phục theo requestId và chống tạo trùng tệp.
- Toàn bộ 60 kiểm thử trình duyệt đạt trên Chromium mobile, WebKit mobile, Chromium desktop.
- Lint và TypeScript/Vite build đạt.
- Giao diện điện thoại đã kiểm tra bằng ảnh chụp; không tràn ngang.
- Chưa deploy hoặc tạo/sửa dữ liệu Google thật.
