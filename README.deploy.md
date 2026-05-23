# Quy trình deploy vào website chính

Source chính của app nằm trong thư mục này. Bản chạy tĩnh cho website chính nằm ở `../public/webapp/quan-ly-thiet-bi/` và được sinh tự động khi deploy.

Chạy từ thư mục gốc repo:

```bash
npm run deploy:thiet-bi
```

Không sửa trực tiếp bản build trong `public/webapp/quan-ly-thiet-bi/assets` hoặc `public/webapp/quan-ly-thiet-bi/index.html`; các thay đổi ở đó sẽ bị ghi đè trong lần deploy tiếp theo.
