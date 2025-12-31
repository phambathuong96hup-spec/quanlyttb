import streamlit as st
import pandas as pd
import sqlite3
from datetime import datetime, timedelta
import plotly.express as px

# --- CẤU HÌNH TRANG ---
st.set_page_config(page_title="Quản lý TBYT - TTYT Thanh Ba", layout="wide", page_icon="🏥")

# --- XỬ LÝ DATABASE (SQLite) ---
DB_FILE = "tbyt_thanhba.db"

def init_db():
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    # Tạo bảng thiết bị nếu chưa có
    c.execute('''
        CREATE TABLE IF NOT EXISTS thiet_bi (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ten_thiet_bi TEXT,
            khoa_phong TEXT,
            model TEXT,
            serial TEXT,
            chu_ky_kiem_dinh TEXT,
            ngay_hieu_chuan_gan_nhat DATE,
            han_hieu_chuan_tiep_theo DATE,
            nguoi_phu_trach TEXT,
            trang_thai TEXT DEFAULT 'Hoạt động'
        )
    ''')
    # Tạo bảng lịch sử bảo trì
    c.execute('''
        CREATE TABLE IF NOT EXISTS lich_su (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            thiet_bi_id INTEGER,
            ngay_thuc_hien DATE,
            noi_dung TEXT,
            ghi_chu TEXT
        )
    ''')
    conn.commit()
    conn.close()

def load_data():
    conn = sqlite3.connect(DB_FILE)
    df = pd.read_sql_query("SELECT * FROM thiet_bi", conn)
    conn.close()
    return df

def add_device(ten, khoa, model, serial, chu_ky, ngay_gan_nhat, han_tiep_theo, nguoi_pt):
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute('''
        INSERT INTO thiet_bi (ten_thiet_bi, khoa_phong, model, serial, chu_ky_kiem_dinh, ngay_hieu_chuan_gan_nhat, han_hieu_chuan_tiep_theo, nguoi_phu_trach)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ''', (ten, khoa, model, serial, chu_ky, ngay_gan_nhat, han_tiep_theo, nguoi_pt))
    conn.commit()
    conn.close()

def update_status(device_id, new_date, note):
    """Cập nhật ngày kiểm định mới và lưu lịch sử"""
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    
    # 1. Lấy thông tin chu kỳ hiện tại
    c.execute("SELECT chu_ky_kiem_dinh FROM thiet_bi WHERE id=?", (device_id,))
    chu_ky_text = c.fetchone()[0]
    
    # 2. Tính toán hạn tiếp theo (Logic đơn giản: X Năm/Lần)
    try:
        years_to_add = int(chu_ky_text.split()[0]) # Lấy số đầu tiên trong chuỗi "1 Năm/ Lần"
    except:
        years_to_add = 1 # Mặc định 1 năm nếu lỗi
        
    next_date_obj = datetime.strptime(str(new_date), '%Y-%m-%d') + timedelta(days=365 * years_to_add)
    next_date_str = next_date_obj.strftime('%Y-%m-%d')
    
    # 3. Update bảng thiết bị
    c.execute('''
        UPDATE thiet_bi 
        SET ngay_hieu_chuan_gan_nhat = ?, han_hieu_chuan_tiep_theo = ?
        WHERE id = ?
    ''', (new_date, next_date_str, device_id))
    
    # 4. Lưu lịch sử
    c.execute('''
        INSERT INTO lich_su (thiet_bi_id, ngay_thuc_hien, noi_dung, ghi_chu)
        VALUES (?, ?, ?, ?)
    ''', (device_id, new_date, "Hoàn thành kiểm định/Bảo dưỡng", note))
    
    conn.commit()
    conn.close()

# --- GIAO DIỆN CHÍNH ---
def main():
    init_db()
    
    st.sidebar.image("https://img.icons8.com/color/96/caduceus.png", width=80)
    st.sidebar.title("TTYT THANH BA")
    st.sidebar.subheader("Quản lý Công tác Dược & TTB")
    
    menu = ["Dashboard (Tổng quan)", "Danh sách thiết bị", "Lịch kiểm định & Deadline", "Nhập liệu từ Excel"]
    choice = st.sidebar.radio("Menu", menu)

    # --- 1. DASHBOARD ---
    if choice == "Dashboard (Tổng quan)":
        st.header("📊 Tổng quan tình trạng trang thiết bị 2026")
        df = load_data()
        
        if not df.empty:
            # Xử lý ngày tháng
            df['han_hieu_chuan_tiep_theo'] = pd.to_datetime(df['han_hieu_chuan_tiep_theo'], errors='coerce')
            today = datetime.now()
            
            # Phân loại
            overdue = df[df['han_hieu_chuan_tiep_theo'] < today]
            upcoming = df[(df['han_hieu_chuan_tiep_theo'] >= today) & (df['han_hieu_chuan_tiep_theo'] <= today + timedelta(days=30))]
            
            # Metrics
            col1, col2, col3, col4 = st.columns(4)
            col1.metric("Tổng thiết bị", len(df))
            col2.metric("Quá hạn kiểm định", len(overdue), delta_color="inverse")
            col3.metric("Sắp đến hạn (30 ngày)", len(upcoming), delta_color="off")
            col4.metric("Hoạt động tốt", len(df) - len(overdue) - len(upcoming))
            
            st.divider()
            
            # Biểu đồ
            c1, c2 = st.columns(2)
            with c1:
                st.subheader("Phân bố theo Khoa/Phòng")
                fig_khoa = px.pie(df, names='khoa_phong', hole=0.4)
                st.plotly_chart(fig_khoa, use_container_width=True)
            
            with c2:
                st.subheader("Tình trạng hạn kiểm định")
                status_counts = {
                    "Quá hạn": len(overdue),
                    "Sắp đến hạn": len(upcoming),
                    "An toàn": len(df) - len(overdue) - len(upcoming)
                }
                fig_status = px.bar(x=list(status_counts.keys()), y=list(status_counts.values()), 
                                    color=list(status_counts.keys()), 
                                    color_discrete_map={"Quá hạn": "red", "Sắp đến hạn": "orange", "An toàn": "green"})
                st.plotly_chart(fig_status, use_container_width=True)
        else:
            st.info("Chưa có dữ liệu. Vui lòng nhập liệu hoặc Import từ Excel.")

    # --- 2. DANH SÁCH THIẾT BỊ ---
    elif choice == "Danh sách thiết bị":
        st.header("📋 Danh mục quản lý thiết bị")
        df = load_data()
        
        # Bộ lọc
        filter_khoa = st.selectbox("Lọc theo khoa:", ["Tất cả"] + list(df['khoa_phong'].unique()) if not df.empty else [])
        if filter_khoa != "Tất cả":
            df = df[df['khoa_phong'] == filter_khoa]
            
        st.dataframe(df, use_container_width=True)
        
        with st.expander("➕ Thêm thiết bị mới thủ công"):
            with st.form("add_form"):
                c1, c2 = st.columns(2)
                ten = c1.text_input("Tên thiết bị")
                khoa = c2.text_input("Nơi đặt (Khoa/Phòng)")
                model = c1.text_input("Model")
                serial = c2.text_input("Serial")
                chuky = c1.selectbox("Chu kỳ kiểm định", ["1 Năm/ Lần", "2 Năm/ Lần", "3 Năm/ Lần"])
                nguoi = c2.text_input("Người chịu trách nhiệm", "Kiều Mạnh Toàn - Trần Anh Vĩ")
                last_date = c1.date_input("Ngày kiểm định gần nhất")
                next_date = c2.date_input("Hạn kiểm định tiếp theo")
                
                submitted = st.form_submit_button("Lưu thiết bị")
                if submitted:
                    add_device(ten, khoa, model, serial, chuky, last_date, next_date, nguoi)
                    st.success("Đã thêm thành công!")
                    st.rerun()

    # --- 3. LỊCH KIỂM ĐỊNH & DEADLINE ---
    elif choice == "Lịch kiểm định & Deadline":
        st.header("📅 Theo dõi Deadline & Tiến độ")
        df = load_data()
        if not df.empty:
            df['han_hieu_chuan_tiep_theo'] = pd.to_datetime(df['han_hieu_chuan_tiep_theo'])
            today = pd.to_datetime(datetime.now().date())
            
            # Tính số ngày còn lại
            df['days_left'] = (df['han_hieu_chuan_tiep_theo'] - today).dt.days
            
            # Sắp xếp ưu tiên việc gấp
            df_sorted = df.sort_values(by='days_left')
            
            for index, row in df_sorted.iterrows():
                # Logic màu sắc cảnh báo
                if row['days_left'] < 0:
                    status_color = "🔴 QUÁ HẠN"
                    bg_color = "#ffe6e6"
                elif row['days_left'] <= 30:
                    status_color = "🟡 SẮP ĐẾN HẠN"
                    bg_color = "#fff5e6"
                else:
                    status_color = "🟢 ỔN ĐỊNH"
                    bg_color = "#e6ffe6"
                
                with st.container():
                    st.markdown(f"""
                    <div style="background-color: {bg_color}; padding: 10px; border-radius: 5px; margin-bottom: 10px; border: 1px solid #ddd;">
                        <h4>{row['ten_thiet_bi']} ({row['khoa_phong']}) - {status_color}</h4>
                        <p><b>Model:</b> {row['model']} | <b>Serial:</b> {row['serial']}</p>
                        <p><b>Hạn chót:</b> {row['han_hieu_chuan_tiep_theo'].strftime('%d-%m-%Y')} (Còn {row['days_left']} ngày)</p>
                        <p><b>Người phụ trách:</b> {row['nguoi_phu_trach']}</p>
                    </div>
                    """, unsafe_allow_html=True)
                    
                    # Nút xác nhận hoàn thành
                    with st.popover(f"✅ Cập nhật tiến độ ID {row['id']}"):
                        st.write("Xác nhận đã hoàn thành kiểm định/bảo dưỡng?")
                        note = st.text_input("Ghi chú", key=f"note_{row['id']}")
                        date_done = st.date_input("Ngày thực hiện", datetime.now(), key=f"date_{row['id']}")
                        if st.button("Xác nhận hoàn thành", key=f"btn_{row['id']}"):
                            update_status(row['id'], date_done, note)
                            st.toast("Đã cập nhật dữ liệu và tính hạn mới!")
                            st.rerun()

    # --- 4. NHẬP LIỆU TỪ EXCEL ---
    elif choice == "Nhập liệu từ Excel":
        st.header("📥 Import dữ liệu từ file CSV của bạn")
        st.markdown("Sử dụng file `...PL TTB.csv` bạn đã cung cấp.")
        
        uploaded_file = st.file_uploader("Chọn file CSV", type=['csv'])
        if uploaded_file is not None:
            try:
                # Đọc file CSV, bỏ qua các dòng tiêu đề rác ở trên (header=4 dựa trên file mẫu)
                df_upload = pd.read_csv(uploaded_file, header=4) 
                
                # Mapping cột (Dựa trên cấu trúc file của bạn)
                # Cần kiểm tra kỹ tên cột trong file CSV thực tế
                st.write("Dữ liệu xem trước:")
                st.dataframe(df_upload.head())
                
                if st.button("Tiến hành Import vào Database"):
                    count = 0
                    for index, row in df_upload.iterrows():
                        # Bỏ qua các dòng tiêu đề phụ lặp lại
                        if str(row['Tên Thiết bị']) == "Tên Thiết bị" or pd.isna(row['Tên Thiết bị']):
                            continue
                            
                        # Xử lý ngày tháng (File của bạn có nhiều định dạng 2026-06-27 hoặc 14/02/2028)
                        def parse_date(date_str):
                            if pd.isna(date_str): return None
                            formats = ['%Y-%m-%d', '%d/%m/%Y', '%Y/%m/%d']
                            for fmt in formats:
                                try:
                                    return datetime.strptime(str(date_str).strip(), fmt).date()
                                except:
                                    pass
                            return datetime.now().date() # Fallback

                        add_device(
                            ten=row.get('Tên Thiết bị', ''),
                            khoa=row.get('Nơi đặt thiết bị', ''),
                            model=row.get('Model', ''),
                            serial=row.get('Seri Máy', ''),
                            chu_ky=row.get('Thời gian thực hiện lại/ năm.', '1 Năm/ Lần'),
                            ngay_gan_nhat=parse_date(row.get('Ngày cấp/ Ngày Đăng kiểm')),
                            han_tiep_theo=parse_date(row.get('Thời hạn cấp lại/ Hạn đăng \nkiểm')), # Lưu ý ký tự xuống dòng trong tên cột
                            nguoi_pt=row.get('Người chịu trách nhiệm chính ', '')
                        )
                        count += 1
                    st.success(f"Đã import thành công {count} thiết bị!")
            except Exception as e:
                st.error(f"Lỗi khi đọc file: {e}")

if __name__ == "__main__":
    main()
