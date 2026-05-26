# PROMPT: BUILD AGENTS LEARNING JOURNEY WEBSITE
## Paste prompt ini ke Claude untuk build website-nya

---

> **CARA PAKAI:** Copy semua teks di bawah garis ini dan paste ke Claude baru.
> Claude akan build satu file HTML lengkap yang bisa langsung dibuka di browser.

---

---

## PROMPT MULAI DI SINI ↓

Buatkan saya sebuah website learning system bernama **"Agents Learning Journey"** untuk IgniteX — sistem coaching agent asuransi Prudential. Website ini adalah sistem onboarding interaktif yang digunakan saat coaching agent baru. Harus dibangun sebagai **satu file HTML lengkap** (semua CSS dan JavaScript inline dalam satu file).

---

## TUJUAN WEBSITE

Website ini digunakan oleh leader saat coaching tatap muka atau online dengan agent baru. Tampil di layar bersama-sama. Setiap modul adalah satu sesi coaching. Agent baru bisa kembali ke website ini kapanpun untuk review materi.

---

## DESIGN REQUIREMENTS

**Visual Style:**
- Modern, clean, high-engagement — seperti platform edukasi premium (bukan presentasi korporat biasa)
- Color scheme: Dark background (#0D0D0D atau #111) dengan aksen merah (#E63946) dan putih. Aksen gold (#F4A261) untuk highlight penting.
- Typography: Font Inter atau Poppins (Google Fonts), besar dan bold untuk headline
- Banyak white space, card-based layout
- Animasi halus: fade-in saat scroll, progress bar yang bergerak, hover effects
- Fully responsive (desktop dan mobile)
- Nuansa "elite training platform" — bukan brosur asuransi biasa

**UX Requirements:**
- Sidebar navigasi kiri dengan progress tracker — menampilkan 6 modul, progress ditandai dengan checklist
- Setiap modul bisa diakses langsung dari sidebar
- Progress tersimpan di localStorage (kalau user refresh, posisi tersimpan)
- Smooth scroll antar section
- Tombol "Tandai Selesai" di setiap modul — memberi checkmark di sidebar
- Di bagian atas: nama agent bisa diisi (personalisasi — "Selamat datang, [nama]!")

---

## STRUKTUR KONTEN — 6 MODUL

### ═══ MODUL 0: B.O.P — BUSINESS OPPORTUNITY PRESENTATION ═══

**Header modul:** "25 Menit yang Bisa Mengubah Hidupmu"
**Subtitle:** Disampaikan SEBELUM agent bergabung

**Konten yang harus ditampilkan:**

**Section A — Opening Hook**
Card besar dengan pertanyaan:
> "Kamu pilih yang mana?"
Tiga kartu pilihan horizontal: 
- 🏢 Pekerjaan yang Lebih Stabil  
- 💰 Penghasilan yang Lebih Besar  
- ❤️ Personal Life yang Lebih Baik  
Teks di bawah: *"Setiap orang ingin ketiganya. Tapi sistem yang ada sekarang tidak dirancang untuk memberikan semuanya — kecuali kalau kamu tahu di mana harus berdiri."*

**Section B — Perbandingan Perusahaan A vs B**
Tampilkan sebagai comparison card dua kolom:

Perusahaan A (Income: Rp 10.000.000):
- ✓ Income 10jt
- ✓ Uang Lembur
- ✓ Uang Pulsa
- ✓ Uang Transport
- ✓ Uang Bonus
- ✗ Biaya RS & Sakit Kritis (merah)
- ✗ Jaminan Income hingga usia 55th (merah)
- ✗ Uang bagi keluarga yang ditinggalkan (merah)

Perusahaan B / Prudential (Income: Rp 8.500.000):
- ✓ Income 8,5jt
- ✓ Uang Lembur
- ✓ Uang Pulsa
- ✓ Uang Transport
- ✓ Uang Bonus
- ✓ Biaya RS & Sakit Kritis (hijau, bold)
- ✓ Jaminan Income hingga usia 55th (hijau, bold)
- ✓ Uang bagi keluarga yang ditinggalkan (hijau, bold)

Insight box di bawah: *"Income lebih kecil Rp 1,5jt/bulan. Tapi total protection package-nya jauh lebih besar. Mana yang lebih aman untuk keluargamu?"*

**Section C — Commission & Bonus: "Kerja Satu Kali, Dibayar 24 Kali"**
Tampilkan tabel komisi:
- Year 1: Komisi 30% + Bonus 6% = 36%
- Year 2: 36%
- Year 3-5: 5% masing-masing
- Total 5 tahun: 87%

Di bawah tabel, tampilkan ilustrasi akumulasi income:
- Januari: Rp 1.000.000
- Februari: Rp 2.000.000 (akumulasi)
- Maret: Rp 3.000.000 (akumulasi)
Dengan animasi counter yang naik.

**Section D — Career Ladder (Step Chart)**
Tampilkan sebagai staircase visual naik ke kanan:
1. Agent/Pro AAB → Income Rp 7,5jt/bulan
2. AAB (Associate Agency Builder) → Income Rp 31,5jt/bulan — *"Bangun tim sendiri"*
3. AB (Agency Builder) → Income Rp 70,5jt/bulan — *"Bisnis dapat diwariskan"*
4. SAB1 (Senior Agency Builder) → Income Rp 154,5jt/bulan — *"Royalty bisnis"*

Label: "PROMOSI KARENA PERFORMA — bukan senioritas, bukan nepotisme"

**Section E — Closing BOP**
Quote besar:
> *"Bisnis bukan hanya tentang Produk. Tetapi tentang lingkungan, sistem yang berjalan, dan orang-orang yang ada di dalamnya."*

---

### ═══ MODUL 1: ABC MINDSET ═══

**Header modul:** "Fondasi Mental Seorang Agent"
**Subtitle:** Coaching pertama setelah bergabung — 60–90 menit

Tampilkan sebagai 3 tab besar yang bisa diklik: **A | B | C**

**Tab A — ACCEPT**

Headline: "Terima Bahwa Kamu Adalah Seorang Agent"

Box peringatan (styled seperti alert/warning card berwarna amber):
> ⚠️ **AGENT RAHASIA ≠ AGENT SUKSES**
> Banyak agent baru yang malu mengakui profesinya. Mereka diam-diam ngobrol tapi tidak jujur soal tujuannya. Ini tidak efektif — dan tidak benar.

Tiga poin Accept dengan ikon:
- 🆔 Gw adalah agen asuransi Prudential — dan itu profesi yang worth it
- 🎯 Profesi ini punya misi mulia: melindungi keluarga orang
- ✅ Gw tidak menjebak siapapun — gw menawarkan solusi nyata

Dua kolom "Dua Cara Membantu Orang":

**SELLING (Jual Produk)**
Card dengan 3 pain point:
1. 🏥 Biaya Rumah Sakit — "Tagihan RS bisa menguras tabungan dalam hitungan hari"
2. 💔 Biaya Hidup Saat Sakit Kritis — "Sakit kritis = berhenti kerja. Tapi kebutuhan hidup tidak berhenti."
3. ⚰️ Biaya Hidup yang Ditinggalkan — "Kamu pergi, tapi tagihan keluargamu tetap ada."

**RECRUITING (Bangun Bisnis)**
Card dengan 4 value proposition:
1. 💼 Memberikan bisnis yang nyata
2. 🌟 Memberikan harapan keluar dari middle income trap
3. 📊 Sistem yang sudah terbukti
4. 🤝 Komunitas yang mendorong naik

Quote di bawah:
> *"Setiap orang yang kamu rekrut dan kamu jual, hidupnya berpotensi berubah karena kamu. Ini bukan jualan biasa. Ini misi."*

**Tab B — BELIEF**

Headline: "Percaya Sebelum Bisa Meyakinkan Orang Lain"

Tampilkan sebagai 4 accordion / expandable card:

**B1 — Believe in Prudential**
Icon: 🏦
Teks: "Bukan karena kita kerja di sana. Tapi karena datanya membuktikan."
[Placeholder untuk data Prudential — ranking, klaim, award, RBC ratio]
Key message: *"Kamu bukan jualan nama besar. Kamu jualan kepercayaan yang sudah terbukti."*

**B2 — Believe in IgniteX**
Icon: 🔥
Teks: "Buktikan dengan bukti nyata, bukan klaim kosong."
Value list: Sistem training terstruktur | Daily accountability | Komunitas yang mendorong naik | Leader aktif di lapangan | Tracking system yang jelas
Key message: *"Kamu bukan join Prudential doang. Kamu join sistem yang akan mendorong kamu sukses."*

**B3 — Believe in Your Leader**
Icon: 👤
Quote besar:
> *"Satu-satunya orang di dunia ini yang paling berkepentingan melihat kamu sukses adalah leader kamu."*
Penjelasan: Income leader terikat performa tim. Reputasi leader bergantung pada hasil timnya. Leader sudah invest waktu dan energi untuk kamu.

**B4 — Believe in Yourself**
Icon: ⚡
Quote:
> *"Semua orang boleh meragukan kamu. Tapi selama kamu percaya kamu bisa — nothing is impossible."*
3 cara bangun self-belief: Hafal kisah sukses tim setiap minggu | Tulis target income spesifik | Tanya diri setiap hari: "Apakah yang gw lakukan hari ini worth it?"

**Tab C — COMMITMENT**

Headline: "Bisnis Bagus Tidak Akan Jalan Tanpa Commitment Pemiliknya"

Mindset shift card — tampilkan sebagai dua kolom kontras:

| MINDSET KARYAWAN | MINDSET OWNER |
|---|---|
| Nunggu dikasih kerjaan | Menciptakan peluang |
| Kerja sesuai jam | Kerja sampai tujuan tercapai |
| Minta naik gaji | Bangun sistem yang menghasilkan lebih |

4 Commitment yang Dibutuhkan (checklist interaktif yang bisa dicentang):
- [ ] Hadir di setiap training dan coaching session
- [ ] Lakukan activity harian minimum setiap hari
- [ ] Jujur — pada leader, pada tim, pada diri sendiri
- [ ] Tidak menyerah dalam 90 hari pertama

Quote penutup:
> *"Gak ada bisnis yang langsung profit di hari pertama. Tapi bisnis yang pemiliknya commit, pasti akan menemukan jalannya."*

---

### ═══ MODUL 2: THE SALES CYCLE ═══

**Header modul:** "Ini Kerjaan Lo Sehari-hari"
**Subtitle:** Pahami 5 langkah yang harus terus diulang

Tampilkan cycle sebagai flowchart visual yang bisa diklik — setiap step membuka detail:

**Visual Utama:** Lingkaran besar dengan 5 steps berputar, ada panah "REPEAT THE CYCLE" di tengah

Klik setiap step untuk buka panel detail:

**Step 1 — BUAT LIST NAMA** 🗒️
Konten: Tabel R1/R2/R3 dengan penjelasan. Tips: jangan filter siapa yang "kira-kira mau" — tulis semua. Target minimal 50 nama.

**Step 2 — BIKIN JANJI P1** 📞
Konten: Guide script telepon lengkap dalam speech bubble / dialog format:
1. "Halo, ganggu ga kalau di telepon?"
2. "Dari kantor lagi ada Market Survey tentang financial planning..."
3. "Kalau Senin/Selasa, prefer mana?"
4. "Siang atau malam enaknya?"
5. "Jam 7 atau 8?"
6. "Di [lokasi A] atau [lokasi B]?"
7. "(Rangkum & konfirmasi jadwal)"

Highlight box: *"ILUSI PILIHAN: Setiap pertanyaan kasih 2 opsi, bukan pertanyaan terbuka. Ini meningkatkan konversi janji secara signifikan."*

**Step 3 — PERTEMUAN 1 (P1)** 🤝
Konten: 4 agenda P1 (Fact Finding / Market Survey / Sales Idea / Buat Janji P2)
Warning box: "Tujuan P1 BUKAN closing. Tujuan P1 adalah memahami dan membangun koneksi."

**Step 4 — PERTEMUAN 2 (P2)** 📊
Konten: 4 agenda P2 (Ice Breaking / Presentasi Ilustrasi / Trial Closing / Handling Objections)
Decision flowchart: YES → CLOSING | NO → FOLLOW UP

**Step 5 — FOLLOW UP** 🔄
Konten: "Follow Up adalah Maintaining Relation. No hari ini bukan No selamanya."

---

### ═══ MODUL 3: 3 REASONS OF INSURANCE ═══

**Header modul:** "Cara Menyampaikan Ide Asuransi yang Benar"
**Subtitle:** Role play sampai natural — 60 menit

Intro teks: *"Sebelum orang mau beli, mereka harus paham masalah apa yang diselesaikan. Tiga alasan ini adalah tiga masalah nyata yang terjadi dalam kehidupan nyata."*

Tampilkan sebagai 3 kartu besar yang bisa flip atau expand:

**REASON 1 — BIAYA RUMAH SAKIT** 🏥
Headline: "Tagihan RS Bisa Menguras Tabungan dalam Hitungan Hari"
Problem statement: Ketika sakit dan harus rawat inap, biayanya bisa sangat besar dan tiba-tiba. Tabungan yang dibangun bertahun-tahun bisa habis dalam beberapa hari.
Solution: Manfaat rawat inap menanggung biaya kamar & tindakan medis. Tidak perlu jual aset.
Script box (styled berbeda, warna berbeda):
> 💬 *"Pernah gak lo atau orang terdekat lo masuk RS dan kaget sama tagihan-nya? Itu yang kita coba hindari."*

**REASON 2 — BIAYA HIDUP SAAT SAKIT KRITIS** 💔
Headline: "Sakit Kritis = Income Berhenti. Tapi Tagihan Tidak."
Problem statement: Ketika didiagnosis sakit kritis (kanker, jantung, stroke), pasien tidak bisa bekerja. Income berhenti. Tapi cicilan rumah, sekolah anak, kebutuhan bulanan — tetap berjalan.
Solution: Uang pertanggungan sakit kritis = income replacement selama masa pengobatan.
Script box:
> 💬 *"Kalau besok lo kena kanker stadium 2 dan harus berhenti kerja 2 tahun — siapa yang bayar cicilan rumah lo? Siapa yang bayar sekolah anak?"*

**REASON 3 — BIAYA HIDUP YANG DITINGGALKAN** ⚰️
Headline: "Kamu Pergi. Tapi Tagihan Keluargamu Tidak."
Problem statement: Ketika seseorang meninggal, hidupnya berakhir — tapi kebutuhan keluarganya tidak. Cicilan, biaya sekolah, biaya hidup sehari-hari terus berjalan.
Solution: Uang pertanggungan jiwa diberikan ke ahli waris untuk kelangsungan hidup keluarga.
Script box:
> 💬 *"Kalau lo meninggal besok, istri dan anak lo bisa bertahan berapa bulan dari tabungan yang ada? Itu pertanyaan yang gak enak, tapi itulah kenapa proteksi jiwa itu penting."*

**Role Play Checklist** (di bagian bawah modul):
Interactive checklist:
- [ ] Bisa sampaikan 3 Reasons dalam 5 menit atau kurang
- [ ] Terdengar natural, bukan seperti baca skrip
- [ ] Bisa jawab pertanyaan dasar dari "prospek"
- [ ] Confidence level 7/10 atau lebih

---

### ═══ MODUL 4: NAME LIST + P1 CONTEST ═══

**Header modul:** "Action Minggu Pertama — Mulai Sekarang"
**Subtitle:** 7 hari pertama adalah fondasi segalanya

**Section A — Name List Review**

Intro: *"Duduk sama leader, buka list nama, dan kita review bersama."*

Panduan memilih 10–15 nama prioritas — tampilkan sebagai 3 kriteria card:
- 🤝 R1 yang paling open-minded dan supportif
- ⏰ Orang yang sudah lama tidak kamu hubungi
- 🎯 Orang yang baru punya tanggung jawab baru (nikah, punya anak, baru kerja)

**Section B — P1 Contest**

Tampilkan sebagai reward card yang menarik secara visual — styled seperti achievement/badge:

🏆 **TANTANGAN MINGGU PERTAMA**

| Target | Reward |
|---|---|
| Ketemu 5 orang dalam 7 hari | Rp 50.000 |
| Ketemu 8 orang dalam 7 hari | Rp 100.000 |

Progress tracker interaktif: tombol "+ Tambah P1" yang bisa diklik setiap kali berhasil ketemu seseorang. Tampilkan counter: "X dari 8 orang". Bar progress yang terisi seiring penambahan.

Rules card:
- ✓ Hitung pertemuan yang benar-benar terjadi
- ✓ Zoom meeting juga dihitung  
- ✓ Leader verify setiap P1 yang dilaporkan

Quote motivasi:
> *"Di bisnis ini, orang yang berhasil bukan yang paling pintar. Tapi yang paling cepat bergerak."*

---

### ═══ MODUL 5: ONBOARDING KE KANTOR ═══

**Header modul:** "Welcome to the System"
**Subtitle:** Integrasi ke ekosistem Prudential & IgniteX

4 kartu agenda onboarding:

**1. Sistem Prudential** 📋
- AAJI — Ujian Keagenan
- Regulasi dan kode etik agen
- Tools digital (Pruaccess, aplikasi)

**2. Integrasi IgniteX** 🔥
- Join komunitas (grup, platform)
- Pengenalan Daily Activity System
- Leaderboard & Performance Tracking

**3. Jadwal Training Reguler** 📅
- Morning briefing
- Weekly coaching
- Monthly review

**4. Meet the Team** 🤝
- Kenalan dengan sesama agent dan leader
- Buddy system — dipasangkan dengan agent berpengalaman

**Completion message** (ditampilkan setelah semua modul selesai):
> 🎉 "Selamat! Kamu sudah menyelesaikan Agents Learning Journey Fase 1. Perjalanan sesungguhnya baru dimulai. Let's build something great bersama."

---

## FITUR INTERAKTIF YANG HARUS ADA

1. **Nama Agent di Header** — input field "Masukkan namamu" di halaman pertama. Setelah isi, semua modul menyapa dengan nama mereka.

2. **Progress Tracker Sidebar** — 6 modul ditampilkan. Setiap modul punya tombol "Tandai Selesai" yang memberi checkmark ✅ di sidebar. Progress tersimpan di localStorage.

3. **P1 Contest Counter** — tombol "+ Catat P1" di Modul 4. Counter naik setiap diklik. Setelah 5 = muncul konfeti kecil dan badge "50K EARNED". Setelah 8 = badge "100K EARNED".

4. **Role Play Timer** — di Modul 3, ada tombol "Mulai Timer 5 Menit" untuk practice 3 Reasons. Countdown timer yang terlihat.

5. **Commitment Checklist** — di Tab C Modul 1, 4 checkbox yang bisa dicentang. Kalau semua tercentang, muncul konfirmasi: "Commitment dikunci. Let's go."

6. **Smooth Navigation** — klik item sidebar langsung scroll ke modul tersebut dengan animasi halus.

---

## TECHNICAL NOTES

- Satu file HTML saja (semua CSS dan JS inline)
- Google Fonts: Poppins (weights: 400, 600, 700, 800)
- Tidak boleh ada dependency eksternal kecuali Google Fonts
- localStorage untuk simpan progress dan nama agent
- Tidak perlu backend — semua client-side
- Harus bisa dibuka offline setelah didownload (kecuali font)
- Kompatibel dengan Chrome, Safari, Firefox terbaru

---

## TONE & BAHASA

- Bahasa Indonesia, tapi campuran dengan beberapa istilah Inggris yang sudah umum (sales, closing, follow up, dll)
- Gaya bahasa: direct, engaging, "gw-lu" untuk bagian yang bersifat coaching personal
- Bukan bahasa korporat yang kaku
- Headline harus punch — singkat, kuat, mengena

---

## OUTPUT YANG DIINGINKAN

Satu file HTML lengkap yang bisa langsung dibuka di browser. Semua modul, semua interaktivitas, semua styling ada di dalam satu file. Pastikan semua 6 modul terisi penuh dengan konten yang detail seperti yang sudah dispesifikasikan di atas.

---

*End of prompt.*
