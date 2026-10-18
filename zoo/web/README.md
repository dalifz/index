# 玉谷萬獸園 · Zoo Structure Tools (Planet Zoo 2)

เปิด `index.html` ได้เลย (ดับเบิลคลิก) หรือรันเซิร์ฟเวอร์ในโฟลเดอร์นี้:

    python -m http.server 8765

## ไฟล์
- `index.html`, `style.css` — หน้าเว็บ
- `map.js` — แผนผังภาพวาด SVG 3200×2000 (16:10), pan/zoom, export PNG 4000×2500
- `app.js` — หน้าเลเวล อุณหภูมิ จับคู่ เส้นทาง ทะเบียน เครื่องมือ
- `core.js` — คำนวณกรง ภูมิอากาศ เซฟความคืบหน้า (localStorage)
- `data-plan.js` — **แก้แผนตรงนี้**: โซน กรง เลเวลของสัตว์แต่ละตัว เส้นทาง
- `data-animals.js`, `data-img.js`, `img/` — ข้อมูล + headshot จาก Zoopedia (สร้างอัตโนมัติ)

## อัปเดตข้อมูลจาก Zoopedia
1. ดาวน์โหลดหน้า Zoopedia ทุกตัวลง `pages/` แล้วรัน `tools/extract.py` → `zp.json`
2. `python tools/build_data.py tools/zp.json` → สร้าง `data-animals.js` และ `data-img.js` ใหม่
