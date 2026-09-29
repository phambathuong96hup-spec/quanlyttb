# Bàn giao phần phiếu tự động DOCX/PDF

Ngày 28/09/2026. Mã nguồn đã triển khai cục bộ; chưa commit, push, triển khai Apps Script hay website. Không có tác vụ nào của lượt này ghi vào Sheets/Drive thật.

## Chức năng đã viết

- Sửa chữa, luân chuyển thiết bị cụ thể và yêu cầu luân chuyển theo loại lưu `FormSnapshot` cùng dòng nghiệp vụ, gồm thông tin thiết bị, người lập/khoa từ tài khoản đã xác thực, nội dung, thời điểm và phiên bản mẫu được chọn.
- Tab Đề nghị mua sắm trong Tạo yêu cầu: tên/loại thiết bị, số lượng, đơn vị tính, lý do, yêu cầu kỹ thuật, dự toán và nguồn kinh phí. Không cần chọn tài sản đã tồn tại. Đây là đề nghị mua sắm, chưa phải quy trình phê duyệt/đấu thầu/nhập tài sản.
- Trong Mẫu và phiếu có khu vực Phiếu tự động, trạng thái và hai nút tải DOCX/PDF. Có liên kết từ Tạo yêu cầu đến loại phiếu tương ứng.
- Admin tạo hai bản thử bằng dữ liệu giả, kiểm tra bố cục, xác nhận rồi kích hoạt một mẫu DOCX cho mỗi loại. Thay/ngừng mẫu không sửa phiếu đã lưu. Bản thử chỉ Admin xem.
- API chỉ trả phiếu của chủ sở hữu cho tài khoản thường; Admin xem tất cả. Quyền tải và tạo lại được kiểm tra trên backend, không dựa vào việc ẩn nút. Không trả Drive ID hoặc toàn bộ bản chụp dữ liệu trong danh sách.
- Mẫu PDF/XLSX và luồng tải mẫu/điền thủ công cũ vẫn dùng được. Không thêm chữ ký điện tử.

## Cách vận hành sau khi được phép phát hành

Các bước này **chưa được thực hiện trên hệ thống thật**:

1. Dùng toàn bộ `gas/Code.gs` đã cập nhật. Không chỉ chép riêng hàm worker vì có thay đổi ở schema, router và nơi ghi yêu cầu.
2. Giữ nguyên cấu hình Sheets, email và các trigger hiện hành. Schema mới `2026.09.28.1` bổ sung cột `FormSnapshot` vào Repairs/Transfers và hai sheet `GeneratedForms`, `PurchaseRequests`; không xóa dữ liệu cũ.
3. Kiểm tra dịch vụ nâng cao **Drive API v3** đã bật. Kho phiếu dùng Script Property `FORM_VAULT_FOLDER_ID`, phải là thư mục riêng tư cùng các thư mục cha, chỉ chủ sở hữu có quyền. Kho này đã được thư viện mẫu hiện hành sử dụng; không đặt thư mục chia sẻ chung cho nhân viên.
4. Chủ dự án Apps Script chạy `setupAutomaticFormsTrigger()` một lần, cấp quyền mới nếu được yêu cầu. Hàm cập nhật schema, kiểm tra kho và cài trigger `processAutomaticForms` mỗi phút nếu chưa có. Không thay trigger email báo hỏng hoặc nhắc đăng kiểm.
5. Nếu dự án khai báo OAuth scopes thủ công, bổ sung scope DocumentApp (`https://www.googleapis.com/auth/documents`) và đảm bảo Drive, external request, script triggers cùng các scope Sheets/email đang dùng vẫn được giữ. Không thay toàn bộ manifest bằng cấu hình thiếu các scope cũ.
6. Trong môi trường thử, Admin đăng DOCX → mở Mẫu tự điền đang áp dụng → Tạo bản thử → chờ worker hoặc chạy `processAutomaticForms()` thủ công → Cập nhật phiếu → tải cả DOCX/PDF → kiểm tra → đánh dấu đã kiểm tra → Kích hoạt mẫu.
7. Tạo thử một yêu cầu cho mỗi loại bằng dữ liệu thử, xác nhận phiếu đúng người, đúng khoa và đúng thiết bị. Đăng nhập tài khoản khác, xác nhận không thể xem/tải phiếu đó. Sau nghiệm thu mới triển khai frontend/backend đồng bộ theo quy trình phát hành.

Trigger chạy mỗi phút, mỗi lần xử lý một phiếu để giữ thời gian chạy có giới hạn. Khi có hàng đợi dài, phiếu có thể phải chờ nhiều lượt; gửi yêu cầu không đợi chuyển đổi Drive. Chưa đo thời gian/quota thực tế trên hệ thống của đơn vị.

## Soạn mẫu tương thích

Mẫu tự điền là DOCX tối đa **5 MB**; mỗi tệp kết quả tải về tối đa **8 MB**. Kho mẫu thủ công vẫn giữ giới hạn 8 MB như trước.

Các trường dùng tên chính xác, có hai cặp ngoặc nhọn:

| Nhóm | Trường |
|---|---|
| Bắt buộc cho mọi mẫu | `{{request.code}}`, `{{request.date}}`, `{{requester.name}}`, `{{department.name}}`, `{{device.name}}`, `{{request.description}}` |
| Thông tin tài khoản | `{{requester.username}}` |
| Thiết bị | `{{device.id}}`, `{{device.model}}`, `{{device.serial}}`, `{{device.department}}` |
| Luân chuyển, bắt buộc | `{{transfer.from}}`, `{{transfer.to}}` |
| Số lượng, bắt buộc với mua sắm | `{{request.quantity}}`, `{{request.unit}}` |
| Mua sắm bổ sung | `{{purchase.specification}}`, `{{purchase.estimatedCost}}`, `{{purchase.fundingSource}}` |

Soạn khổ A4, dùng bảng căn cột, ảnh nội dòng và font tiếng Việt phổ biến. Đặt trường trong nội dung, bảng hoặc header/footer thông thường; viết nguyên trường trong một đoạn, không chia qua các ô. Không dùng trường trong textbox nổi, footnote/endnote hoặc header/footer riêng cho từng section. Chưa hỗ trợ vòng lặp bảng kê nhiều thiết bị, macro, chữ ký hoặc điều kiện trong mẫu. Mỗi phiếu ứng với một yêu cầu; luân chuyển theo loại khi chưa phân máy và mua mới sẽ để dấu “—” ở mã/model/serial chưa có.

Google chuyển DOCX sang Google Docs để điền, sau đó xuất hai định dạng. Bố cục phức tạp/font đặc biệt có thể thay đổi; vì vậy cần xem cả hai bản thử trước khi kích hoạt. Kiểm tra tên dài, nội dung nhiều dòng, ngắt trang, số trang và tiếng Việt. Không cam kết mọi DOCX tùy ý giữ bố cục hoàn toàn giống Word.

DOCX người dùng tự chỉnh sau khi tải không cập nhật ngược vào bản PDF hoặc dữ liệu hệ thống. Bản chụp thông tin của phiếu đã gửi không thay đổi khi đổi khoa, sửa tên thiết bị hay thay mẫu.

## Xử lý lỗi

| Trạng thái | Ý nghĩa và cách xử lý |
|---|---|
| Chờ tạo phiếu | Dữ liệu đã lưu; đợi worker và bấm Cập nhật phiếu. Nếu không tiến triển, Admin kiểm tra trigger và Executions. |
| Đang tạo phiếu | Worker đang giữ tác vụ; không tạo lại yêu cầu nghiệp vụ. Lease 10 phút tự hết nếu lần chạy bị ngắt. |
| Chờ Admin kích hoạt mẫu | Chưa có mẫu hợp lệ khi gửi yêu cầu. Admin kích hoạt mẫu, người lập hoặc Admin chọn Tạo lại. Phiên bản được chọn khi khôi phục sẽ được lưu vào bản chụp. |
| Cần xử lý | Tự thử tối đa 3 lần. Kiểm tra thông báo lỗi, quyền Drive và Apps Script Executions; sau khi sửa nguyên nhân chọn Tạo lại. |
| Sẵn sàng | Cả DOCX và PDF đã lưu thành công. |

Mẫu đã gắn vào phiếu lỗi được giữ cố định; đăng mẫu khác không âm thầm đổi nội dung phiếu đó. Nếu mẫu cố định bị sai cần đối soát có quản trị, không tự đổi phiên bản. Nếu dữ liệu bắt buộc của yêu cầu đã lưu bị thiếu, thông báo yêu cầu Admin đối soát; không lấy dữ liệu tài khoản/thiết bị mới để viết lại lịch sử.

Worker dùng khóa ngắn khi nhận/kết thúc việc, không giữ khóa trong lúc chuyển đổi Drive. Kết quả của lần chạy cũ không được ghi đè lần mới. Hai tệp chỉ được công bố cùng nhau; lỗi PDF không tạo thêm yêu cầu. Nếu ghi kết quả vào Sheets có trạng thái không chắc chắn, giữ tệp riêng tư để đối soát. Một số tệp không còn được tham chiếu có thể tồn tại sau sự cố; không xóa hàng loạt chỉ dựa vào tên. Đối chiếu ID tệp đang được `GeneratedForms` tham chiếu và mã lần chạy trong Executions trước khi dọn.

## Kiểm thử và giới hạn nghiệm thu

Kết quả kiểm tra cục bộ ngày 28/09/2026: `npm test` **241/241 đạt**; `npm run test:e2e` **129/129 đạt** trên ba cấu hình trình duyệt (6,3 phút); `npm run lint`, `npm run build` và `git diff --check` đạt. Đã xem ảnh giao diện tải hai định dạng và kích hoạt mẫu trên màn hình điện thoại. Các ca mới kiểm tra quyền và lỗi Drive bằng mô phỏng, không gửi phiếu hoặc email thật.

Kiểm thử backend chạy bằng mô phỏng dịch vụ Apps Script: bản chụp, sở hữu, chống trùng, mẫu ngừng dùng, yêu cầu mua sắm gửi lại với nội dung khác, quyền quản trị, xác nhận bản thử, lease, giới hạn thử, kết quả cũ, khóa thất bại, điền văn bản nguyên nghĩa, lưu cả hai tệp và dọn tệp xuất dở. Kiểm thử trình duyệt dùng API giả lập trên Chromium và WebKit, có kích thước điện thoại.

Các kiểm thử này không thay cho chạy chuyển đổi bằng Drive/DocumentApp thật. Chưa xác nhận quyền OAuth, trigger hoặc bố cục của mẫu thật trên Google Drive vì người dùng yêu cầu chưa deploy. Trước phát hành cần nghiệm thu bước 6–7 ở môi trường thử.

Tham chiếu API: [Advanced Drive v3](https://developers.google.com/apps-script/advanced/drive), [chuyển đổi khi tải tệp](https://developers.google.com/workspace/drive/api/guides/manage-uploads), [điền văn bản với DocumentApp](https://developers.google.com/apps-script/reference/document/text).

## Cập nhật vận hành 29/09/2026

Apps Script production đã được cập nhật lên phiên bản 24 ngày 28/09/2026, giữ nguyên URL. Đã sửa Script Property FORM_VAULT_FOLDER_ID và khôi phục đúng tên thuộc tính trong formVaultFolder_; setupAutomaticFormsTrigger hoàn tất, trigger processAutomaticForms đã có lần chạy thành công. Các ghi chú “chưa triển khai” ở trên mô tả thời điểm bàn giao ban đầu.

Ngày 29/09 kiểm thử unit đạt 242/242. Giao diện đang được chuẩn bị phát hành qua workflow GitHub Pages có cổng kiểm tra lint, unit, build và E2E. Chưa nghiệm thu chuyển đổi mẫu thật: cần phiên đăng nhập Admin và mẫu DOCX của đơn vị, kiểm tra cả hai tệp trước khi kích hoạt.
