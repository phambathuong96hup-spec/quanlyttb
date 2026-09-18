# Nghiệm thu độc lập AI lần 3 — 18/09/2026

Người kiểm tra: Codex. Đọc trực tiếp mã và chạy lại kiểm thử, không lấy báo cáo Antigravity làm bằng chứng đạt.

## Kết luận

**Chấp nhận các hạng mục sửa lỗi đã phát hiện trong hai vòng review trước, trong phạm vi source local và tình huống đã kiểm tra.** Không còn tái hiện bảy tình huống lỗi trong bộ kiểm thử độc lập. Không đồng nghĩa đã nghiệm thu chất lượng mọi câu trả lời AI hoặc đã phát hành production.

## Bằng chứng mới

| Lệnh | Kết quả |
| --- | --- |
| `npx playwright test -c tmp/ai-review.config.ts` | 7/7 đạt, 10,8 giây |
| `npx playwright test e2e/ai-assistant.spec.ts` | 27/27 đạt: 9 kịch bản × Chromium mobile, WebKit mobile, Chromium desktop |
| `npm test` | 177/177 đạt |
| `npm run lint` | Exit 0 |
| `npm run build` | Exit 0; Vite 1,21 giây |

Log lần chạy này: `tmp/ai-r3-independent.log`, `tmp/ai-r3-e2e.log`, `tmp/ai-r3-unit.log`, `tmp/ai-r3-lint.log`, `tmp/ai-r3-build.log`.

## Đối chiếu lỗi

- Backend 503: tra cứu local thành công và gắn đúng nhãn Local RAG.
- Chỉ mục lỗi lần đầu: sau phục hồi mạng tải lại và trả kết quả.
- Backend báo retrieval_fallback: không gắn nhãn Cloud LLM.
- Làm mới hội thoại: phản hồi cũ không quay lại phiên mới.
- Thiếu metadata: dùng nhãn trung tính.
- Stream gửi nội dung rồi báo lỗi: hiển thị cảnh báo chưa hoàn tất và mở lại ô nhập.
- Nguồn snake_case từ backend: thẻ nguồn có tên tài liệu; E2E chính thức kiểm tra thêm mục và tên tệp.

Mã nguồn cũng đã bổ sung timeout 10 giây khi tải chỉ mục, loại lời chào tĩnh khỏi conversation_history và giới hạn lời hứa offline theo khả năng tải/giữ chỉ mục trong bộ nhớ. Callback hoàn tất cập nhật lại metadata nguồn của tin nhắn.

## Giới hạn nghiệm thu

- Các bài trình duyệt dùng dữ liệu và phản hồi mạng giả lập; không phát sinh hồ sơ nghiệp vụ thật.
- Lượt này không gọi mô hình production để chấm độ chính xác pháp lý, hiệu lực văn bản, độ đầy đủ của dữ liệu hoặc khả năng chống bịa.
- Không kiểm tra lại toàn bộ E2E ngoài AI. Test rời trang hiện kiểm tra điều hướng thành công; chưa đo độc lập lưu lượng mạng sau unmount. Cơ chế abort/session guard đã được xem trong mã.
- Timeout tải chỉ mục được xác nhận trong mã; không có phép đo timeout thực tế mới trong lượt này. Không cam kết hoạt động hoàn toàn offline từ lần đầu.
- Chưa đánh giá lại xác thực/quota của backend AI, streaming token-by-token hoặc triển khai backend.
- Không sửa source ứng dụng, không commit/push/deploy. Cần phát hành và smoke test trên web thật để nghiệm thu triển khai.
