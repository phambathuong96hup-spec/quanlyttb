# Du an Quan ly trang thiet bi

Day la du an React + TypeScript + Vite duoc tach rieng tu app Quan ly trang thiet bi hien co. Du an da mang theo source frontend, assets, Google Apps Script backend va snapshot du lieu thiet bi de ban co the tiep tuc phat trien doc lap.

## Noi dung da co

- `src/`: ma nguon React cua ung dung.
- `public/`: favicon, manifest, anh banner va asset tinh.
- `src/data/devices.snapshot.json`: snapshot du lieu thiet bi tu file `parsed_devices.json`.
- `gas/Code.gs`: backend Google Apps Script day du cho Google Sheets.
- `gas/README.md`: huong dan cau hinh Google Sheets va deploy Apps Script.
- `GAS_GSP_addon.gs`: phan bo sung cho nhat ky GSP neu can doi chieu.

## Chay local

```bash
npm install
npm run dev
```

Mac dinh app goi API Google Apps Script dang cau hinh trong `src/services/api.ts`.
Khong bat buoc can file `.env` de chay app.

## Dung snapshot noi bo

Tao file `.env.local` tu `.env.example`, sau do bat snapshot:

```bash
VITE_USE_LOCAL_SNAPSHOT=true
VITE_BASE_PATH=/
```

Che do nay giup man hinh danh sach/tong quan thiet bi doc du lieu tu `src/data/devices.snapshot.json` ma khong can goi API. Cac chuc nang ghi du lieu nhu dang nhap, bao sua chua, luan chuyen, GSP van can Google Apps Script neu muon su dung day du.

## Ket noi Google Apps Script rieng

1. Mo `gas/README.md` va tao/cau hinh Google Sheets theo huong dan.
2. Deploy `gas/Code.gs` dang Web app.
3. Cap nhat endpoint mac dinh trong `src/services/api.ts` neu doi deployment.
4. Chay lai `npm run dev`.

## Build

```bash
npm run build
```

Neu deploy vao subpath, dat `VITE_BASE_PATH` truoc khi build. Vi du:

```bash
VITE_BASE_PATH=/webapp/quan-ly-thiet-bi/ npm run build
```
