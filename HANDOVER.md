# Catatan Serah Terima — Location Intelligence Platform

**Status proyek: ditutup, September 2026.**

Dokumen ini bukan dokumentasi kode. Kodenya bisa dibaca sendiri. Ini catatan
**temuan yang tidak tersimpan di mana pun** — harga, batas, dan kualitas data
yang butuh berminggu-minggu untuk diketahui, dan akan hilang kalau tidak
ditulis.

Setiap angka di sini **diukur langsung ke API-nya**, bukan dibaca dari
dokumentasi. Di mana saya tidak menguji sesuatu, itu disebut.

---

## 1. Kenapa proyek ini ditutup

Bukan karena kodenya gagal. Pipeline-nya bekerja: 11 agen, antrean pekerjaan,
plafon biaya, lapisan verifikasi, klasifikasi kegagalan.

Yang gagal ada di hulu. Tiga angka yang paling menentukan sukses sebuah lokasi
usaha **tidak dijual siapa pun dengan harga yang terjangkau satu orang**:

| Yang menentukan | Tersedia? |
|---|---|
| Jumlah orang yang benar-benar lewat di depan properti | Tidak |
| Omzet dan kekuatan masing-masing pesaing | Tidak |
| Harga sewa yang sebenarnya (bukan yang diiklankan) | Tidak |

Lima sumber data digali untuk proyek ini — Google Places, OpenStreetMap,
Overture Maps, WorldPop, BPS. Semuanya memperbaiki **penyebut** (berapa orang
di sekitar, berapa pesaing). Tidak satu pun menyentuh **pembilang** (berapa
yang akan beli dari Anda).

Keberatan terkuat justru datang dari pemilik proyek sendiri, dan tidak ada
sumber data yang bisa menjawabnya:

> *"Itu bisa dilakukan sendiri oleh client langsung dari Google Maps, tanpa
> perlu memakai jasa kita."*

**Yang tidak pernah diuji sama sekali:** apakah ada yang mau membayar. Seluruh
energi habis untuk pertanyaan *"apakah datanya cukup bagus"*.

---

## 2. Google Maps Platform

### 2.1 Jebakan field mask — ini yang paling mahal

Meminta `rating` dan `userRatingCount` **memindahkan permintaan dari SKU Pro ke
Enterprise**, dan jatah gratis Enterprise hanya **seperlima** Pro.

| SKU | USD/1.000 | Gratis/bulan |
|---|---:|---:|
| Nearby Search **Pro** | 32 | **5.000** |
| Nearby Search **Enterprise** | 35 | **1.000** |
| Text Search Pro | 32 | 5.000 |
| Text Search Enterprise | 35 | 1.000 |
| Place Details Enterprise | 20 | 1.000 |
| Geocoding | 5 | 10.000 |
| Routes (Compute Routes Essentials) | 5 | 10.000 |
| Street View Static | 7 | 10.000 |
| Street View **metadata** | 0 | tak terbatas |
| Maps Static | 2 | 10.000 |

Sensus pesaing memakai ~13-46 panggilan per laporan. Dengan dua field itu,
jatah gratis habis setelah **22 laporan/bulan**. Tanpanya: **111**.

Pola yang benar: sensus pakai mask murah, lalu **satu** panggilan Enterprise
untuk mengambil rating 20 pesaing yang benar-benar ditampilkan.

Harga dibaca dari daftar harga Google, September 2026. Akan berubah — perlakukan
sebagai perkiraan, otoritasnya tetap tagihan Google.

### 2.2 Batas 20 hasil, dan cara menembusnya

**Setiap** pencarian Places mengembalikan maksimal 20 hasil. Itu **plafon**,
bukan hitungan. Melaporkannya sebagai total adalah kesalahan paling berbahaya
yang bisa dilakukan produk ini — ia memberi tahu orang bahwa pasar yang penuh
itu kosong.

Solusinya: **penyisiran kuadran bertingkat**. Kalau satu petak mengembalikan 20
penuh, pecah jadi empat dan ulangi. Petak yang jarang cukup satu panggilan.

Hasil nyata di Depok & Jakarta Selatan:

| Lokasi | Jenis | Pencarian tunggal | Sensus bertingkat |
|---|---|---:|---:|
| Jl. Tole Iskandar (2 km) | laundry | 20 | **267** |
| Ruko Bella Casa (800 m) | laundry | 20 | **89** (terdekat 28 m) |
| Jl. Kemang Raya (1,5 km) | kafe | 20 | **827** (terdekat 7 m) |
| Jl. Delima Raya (2 km) | rumah makan | 20 | **898** (terdekat 15 m) |

Biaya terukur untuk satu laporan penuh: **22 panggilan, US$ 0,73 (±Rp 11.700)**
— dan US$ 0,00 yang benar-benar ditagih karena masih di dalam jatah gratis.

### 2.3 Tipe tempat harus dipaksa, dan harus tipe yang benar

`includedType` + `strictTypeFiltering` wajib. Tanpanya pencarian jadi pencocokan
nama bebas: jalan bernama "Jalan Sekolah" muncul sebagai sekolah terdekat.

Tapi tipe yang salah lebih parah. Laundry di taksonomi Google bertipe `laundry`,
**bukan `store`**. Memaksa `type: 'store'` membuang semuanya — laundry dengan 89
pesaing dilaporkan punya 1 pesaing 2,3 km jauhnya, dan diberi skor 85/100 untuk
"persaingan rendah".

Tipe yang **diverifikasi ada** (diuji satu per satu ke API):

```
laundry  cafe  coffee_shop  restaurant  meal_takeaway  fast_food_restaurant
bakery  barber_shop  hair_salon  beauty_salon  nail_salon  pharmacy  drugstore
convenience_store  grocery_store  supermarket  car_repair  car_wash  gym
fitness_center  hotel  clothing_store  book_store  hardware_store  florist
pet_store  electronics_store  furniture_store  cell_phone_store  tailor
shoe_store  juice_shop  ice_cream_shop  dessert_shop  food_court
catering_service  child_care_agency  preschool  veterinary_care  bank  atm
gas_station
```

Yang **terdengar masuk akal tapi tidak ada**: `dry_cleaner`, `print_shop`,
`phone_store`, `photo_lab`.

### 2.4 Presisi geocoding menentukan segalanya

`"Jl. Tole Iskandar, Depok"` menghasilkan `granularity: GEOMETRIC_CENTER` —
**titik tengah jalan sepanjang ±4 km**. Semua jarak di laporan diukur dari titik
yang mungkin 2 km dari properti sebenarnya.

Selalu baca field `granularity`. `ROOFTOP` berarti bangunan; apa pun selain itu
berarti seluruh jarak di laporan perlu peringatan.

### 2.5 Ketentuan penyimpanan

Kebijakan Places **hanya mengecualikan `placeId`** dari larangan caching. Nama,
alamat, koordinat, rating, jumlah ulasan adalah konten penyedia dan tidak boleh
disimpan tanpa batas.

Implikasi praktis: simpan `placeId` selamanya, hapus sisanya setelah masa
retensi (proyek ini memakai 30 hari), ambil ulang saat dibutuhkan.

### 2.6 Pengaman biaya setelah billing aktif

Yang benar-benar menghentikan pengeluaran, berurutan dari yang paling efektif:

1. **Batasi kunci per IP + per API** di Cloud Console
2. **Kuota harian per jenis permintaan** — `SearchNearbyRequest per day`,
   `SearchTextRequest per day`. Set `0` untuk yang tidak dipakai
   (Autocomplete, PhotoMedia mahal dan kita tidak memakainya)
3. Plafon biaya di kode — hanya melihat panggilan yang lewat aplikasi kita
4. **Budget alert TIDAK menghentikan apa pun.** Dokumentasi Google menyatakannya
   terang-terangan. Ia hanya mengirim email.

---

## 3. Kualitas tagging POI Indonesia — tiga sumber, semuanya buruk

Ini temuan paling penting untuk siapa pun yang membangun di atas data POI
Indonesia.

Jawaban "fasilitas terdekat" dari tiga sumber untuk premises yang sama di Depok:

| Ditanya | Google menjawab | Overture menjawab |
|---|---|---|
| Rumah sakit | "RUMAH MELAHIRKAN MEDICAL HACKING DEPOK" | "Xing Pet Care and Clinic" (klinik hewan) |
| Sekolah | — | "Learn Indonesian Online" (kursus daring) |
| Stasiun | "Jl. Raya St Depok Lama" (nama jalan) | — |
| Supermarket | "Naga mart cell" (konter HP) | "Biskuit Bayi" |
| Mall | "Fresh market Depok" (pasar basah) | "Cantik cellular depok" (konter HP) |

**Mengganti sumber tidak memperbaikinya.** Overture salah 5 dari 6, dan
kuerinya butuh **208 detik** terhadap S3.

Kepadatan data (radius 800 m dari Ruko Bella Casa):

| Sumber | Total POI | Laundry |
|---|---:|---:|
| Google | — | **89** |
| Overture | 554 | **0** menurut kategori |
| OpenStreetMap | **3 toko** | **0** |

Overture juga menandai **45 "church_cathedral"** di kampung Depok. Taksonominya
belum matang untuk Indonesia.

**Kesimpulan:** Google satu-satunya sumber POI yang layak untuk usaha mikro
Indonesia. OSM dan Overture praktis kosong. Karena tagging Google pun tidak
bisa dipercaya, **validasi nama terhadap kategori wajib** — nama usaha Indonesia
cukup teratur untuk dipakai sebagai pendapat kedua (RS/Klinik/Puskesmas untuk
rumah sakit, SD/SMP/SMA/Madrasah untuk sekolah).

Lihat `src/lib/facility-validation.ts`.

---

## 4. OpenStreetMap — buruk untuk POI, bagus untuk jalan

Satu-satunya hal yang OSM lakukan dengan baik di Indonesia: **jaringan jalan**.

Tersedia lewat Overpass: `highway`, `oneway`, `lanes`, `width`, `surface`,
`maxspeed`.

Contoh nyata:

```
Ruko Bella Casa   → highway=residential, oneway=YES
Jl. Kemang Raya   → highway=tertiary, lebar 8 m, 2 lajur, aspal, dua arah
```

**`oneway=yes` itu fakta bisnis yang tidak bisa didapat dari nama jalan mana
pun** — separuh calon pelanggan harus memutar.

Catatan operasional:

- Overpass **wajib** User-Agent yang bermakna, kalau tidak: 429
- Dijalankan relawan. 504 saat padat — siapkan endpoint cadangan
  (`overpass-api.de`, `overpass.kumi.systems`)
- `width` dan `surface` sering kosong di Indonesia; laporkan per field, jangan
  diam-diam menganggap ada

### Jangkauan lewat jalan, bukan garis lurus

Radius lingkaran menghitung orang di seberang sungai, rel, dan tol. Ukur jarak
**menyusuri jalan** dari graf OSM.

Hasil nyata: hanya **43%** dari lingkaran 800 m di Ruko Bella Casa yang
benar-benar terjangkau. Pasar menyusut dari 31.628 jadi ±13.600 jiwa, dan pangsa
yang harus direbut lebih dari dua kali lipat.

Dua jebakan saat membangunnya:

1. Ukur jarak ke **ruas** jalan, bukan ke **titik**. OSM menaruh node di simpul
   geometri — jalan lurus 300 m cuma punya 2 node, dan tengahnya terlihat tak
   terjangkau.
2. Jaringan grid **tidak menutupi lingkarannya sendiri**. Berjalan 800 m di grid
   menghasilkan belah ketupat, bukan cakram — sudutnya berjarak 1.600 m. Itu
   fitur, bukan bug.

Lisensi: ODbL, wajib atribusi "© Kontributor OpenStreetMap".

---

## 5. WorldPop

- **CC BY 4.0** — boleh komersial, cukup cantumkan sumber
- **Tidak ada versi berbayar.** Program riset University of Southampton, didanai
  Gates Foundation
- API statistik gratis, tanpa key: kirim poligon GeoJSON, dapat jumlah penduduk

**Batasan yang harus diketahui:** API statistik gratis **hanya menerima
`wpgppop`** (2000-2020, 100 m). Produk terbaru — `G2_CN_POP_R25A_100m`
(2015-2030) dan struktur umur/jenis kelamin 100 m — **hanya tersedia sebagai
unduhan raster**, harus di-host dan disampel sendiri.

Angka terukur (Ruko Bella Casa, Depok):

```
radius   500 m :  12.630 jiwa
radius   800 m :  31.628 jiwa
radius 1.000 m :  50.934 jiwa
radius 1.500 m : 110.480 jiwa   (Kemang)
```

**Penting:** WorldPop bukan sumber independen. Ia membangun angkanya **dari data
sensus nasional** (yaitu BPS) lalu menyebarkannya secara spasial memakai citra
permukiman. Yang ia tambahkan adalah **penyebaran spasial**, bukan data baru.

---

## 6. BPS Web API

Kunci gratis didapat dari `webapi.bps.go.id/developer`. **Tapi:**

> **Pasal 4.E** melarang penggunaan untuk kegiatan mencari keuntungan tanpa
> Perjanjian Kerja Sama.
> **Pasal 7** membatasi akses gratis untuk keperluan non-komersial.

**Form pendaftaran memotong field Information di ~300 karakter.** Teks yang
mengungkap niat komersial dan menanyakan PKS tidak ikut terkirim. Kalau butuh
jawaban komersial, email `dataweb@bps.go.id` — form tidak menjawabnya.

### Yang ada (diverifikasi)

**514 variabel untuk Kota Depok saja.** Jangan tertipu halaman pertama — hasilnya
berhalaman-halaman (52 halaman untuk Depok).

```
Penduduk per kecamatan        2020   (rentang 2011-2020)
Penduduk per kelompok umur    2025   (kemungkinan proyeksi, belum diverifikasi)
Kepadatan penduduk            2018   (satu tahun saja)
SP2020 per wilayah/umur       2020
+ inflasi, IHK, pencari kerja, upah, koperasi per kecamatan
```

Contoh data nyata:

```
JUMLAH PENDUDUK PER KECAMATAN, KOTA DEPOK 2020
  Pancoran Mas   244.975      Tapos        263.366
  Sukmajaya      252.531      Cimanggis    252.014
  Cipayung       171.587      ...
  Kota Depok   2.056.335
```

### Yang TIDAK ada (ini yang menentukan)

1. **Tidak ada geografi di bawah kecamatan.** MFD (SIMDASI) memberi *kode*
   sampai desa, tapi endpoint *data* berhenti di kabupaten/kota dengan kecamatan
   sebagai dimensi rincian. Kecamatan itu 15-20 km²; jangkauan usaha 0,5-2,5 km.
2. **Tidak ada jumlah usaha ritel/jasa.** Dicari di seluruh 514 variabel:
   `perusahaan: 0`, `restoran: 0`, `rumah makan: 0`, `umkm: 0`. Yang ada hanya
   industri (3) dan sarana perdagangan (1).
3. **Sensus Ekonomi tidak ada di API.** Hanya SP2020, SP2010, Sensus Pertanian
   2023, Long Form SP2020. Drill-down ke tabel sensus mengembalikan kosong.

**Kesimpulan:** BPS sumber **konteks kewilayahan** yang kaya, bukan **intelijen
tingkat lokasi**. Untuk keperluan catchment, WorldPop 100 m justru lebih presisi
daripada BPS kecamatan. Yang unik dari BPS: **otoritas** ("BPS, SP2020" di mata
klien Indonesia) dan **indikator ekonomi**.

### Catatan teknis

- Endpoint data **wajib** parameter `th`, dan itu **ID internal**, bukan tahun.
  Ambil dulu dari `list/model/th/...` (mis. `th=120` → 2020)
- Field tahun dalam respons bernama `th`, bukan `label`
- Kunci datacontent: `vervar + var + turvar + th + '0'`

---

## 7. Sumber yang menolak akses program

| Sumber | Status |
|---|---|
| **Putusan MA** | `robots.txt` **memblokir eksplisit** GPTBot, ClaudeBot, anthropic-ai, PerplexityBot, CCBot — lalu `User-agent: * Disallow: /` |
| INAPROC, IDX, LKPP ISB | 403 WAF |
| OJK | SharePoint, tanpa robots.txt |
| data.go.id | robots mengizinkan, tapi tidak ada API pencarian terdokumentasi |

**Tren yang perlu diwaspadai:** blok "AI crawlers" di Putusan MA ditulis
sengaja, bukan kelalaian. Membangun bisnis di atas data publik berarti bertaruh
penerbitnya akan **tetap** membiarkannya terbuka. Satu baris `robots.txt` bisa
menghabisi produk yang dibangun setahun.

### Pengadaan pemerintah — satu-satunya jalur resmi yang ditemukan

ISB LKPP dimatikan 31 Des 2025, pindah ke **API Gateway INAPROC**
(`data.inaproc.id/docs`). Terdokumentasi lengkap. Tapi bergerbang:

```
1. Akun Manajemen Akun Terpusat SPSE + verifikasi
2. Daftar role "Data Integrator"
3. Surat permohonan resmi ke LKPP
4. Daftarkan IP publik
5. Ditinjau 1-3 hari kerja
```

Dokumentasi menyebut: *"Layanan ini **diutamakan bagi instansi KLPD**"*.
**Belum diuji** apakah swasta disetujui dan apa ketentuan komersialnya —
dokumentasinya diblokir WAF. Jawabannya hanya bisa didapat lewat permohonan.

---

## 8. Operasi LLM (OpenRouter)

Semua diukur pada `z-ai/glm-5.3-flash`.

**Model reasoning menghabiskan 90% waktunya untuk berpikir.** 1.141 token
reasoning untuk menghasilkan 160 token jawaban.

| Setelan | Rata-rata | Token reasoning | Biaya |
|---|---:|---:|---:|
| `reasoning: {effort: 'low'}` | **5,6 s** | **0** | $0,00011 |
| apa adanya | 25,2 s | 1.141 | $0,00069 |

**4,5× lebih cepat, 6× lebih murah**, isi tetap valid. `reasoning: {enabled:
false}` ditolak — *"Reasoning is mandatory for this endpoint"*.

Tiga jebakan lain:

1. **Tanpa `max_tokens`**, OpenRouter memesan **seluruh konteks model** (65.536
   token) terhadap saldo Anda, untuk permintaan yang jawabannya JSON kecil.
   Laporan gagal 402 pada saldo yang sebenarnya cukup belasan kali lipat.
2. **Akhiran `:batch`** pada nama model → 404. Adapter batch tidak melayani
   endpoint `chat/completions`.
3. **Jangan pernah menempelkan sensus ke dalam prompt.** 898 pesaing jadi ±27.000
   token JSON yang harus dibaca model sebelum menulis tiga paragraf — laporan
   tampak menggantung 5 menit. Kirim 30 terdekat; angkanya sudah dihitung
   deterministik dan menimpa apa pun kata model.

---

## 9. Pelajaran arsitektur yang berlaku di luar proyek ini

Ini bagian yang paling berharga, dan tidak terikat domain.

### Deterministik mengikat, LLM menasihati

Setiap angka yang menggerakkan keputusan dihitung kode, bukan model. LLM hanya
menulis prosa. Ini menyelamatkan laporan berkali-kali — model pernah menilai
daftar berisi satu pesaing sebagai "kepadatan rendah", dan pernah mengarang "100
dari 827 adalah pesaing langsung" untuk daftar yang semuanya satu tipe.

### Verifikasi apa yang Anda ambil

Kategori dari penyedia peta tidak bisa dipercaya. Periksa silang dengan nama.

### Verifikasi apa yang klien berikan — ini yang terlewat paling lama

Sistem memverifikasi segala yang diambil, lalu menerima apa pun yang diketik
klien tanpa suara. Padahal **seluruh sisi finansial berdiri di atas input itu**.

Laporan kafe Kemang: klien memasukkan Rp 150.000 per transaksi dan 300
pelanggan/hari. Model menghasilkan omzet Rp 1,17 miliar/bulan, titik impas 8
pelanggan/hari, balik modal 1,3 bulan, dan rasio okupansi 0,9% — yang laporan
sebut **"masih wajar"**. Setiap angka benar secara aritmetika dan seluruh
halaman itu fiksi.

Penyebabnya: pemeriksaan okupansi hanya melihat **batas atas**. Rasio 17 kali
di bawah lantai sehat lolos sebagai "sehat". Jauh di bawah kisaran wajar bukan
berarti sewa murah — berarti **sisi pendapatannya yang salah**.

### Plafon biaya di database, bukan di memori

Penghitung di memori mengembalikan seluruh anggaran setiap kali deploy.

### Klasifikasikan kegagalan: permanen vs bisa diulang

Kredit habis diulang 3 kali, dan pesan penyedia sendiri menyebutkan bahwa
percobaan ulang **menahan kredit dan memperburuk**. Kredit habis, kunci ditolak,
plafon tercapai, data kurang — semuanya permanen sampai ada yang turun tangan.

### Kegagalan harus terlihat

Pekerjaan gagal permanen, baris job ditandai FAILED, tapi **status proyek tetap
ANALYSIS**. Dari dashboard, pesanan gagal dan pesanan berjalan tampak persis
sama — selamanya. Ketahuan hanya karena ada yang bertanya kenapa lama.

### Uji kelayakan data SEBELUM membangun, bukan sesudah

Ini pelajaran termahal. Audit kelayakan data dilakukan setelah berminggu-minggu
membangun. Ujinya sendiri cepat: OSM terbukti kosong untuk usaha kecil Indonesia
dalam **satu kueri**, Overture terbukti salah kategori dalam **dua**.

Saringan untuk ide berikutnya, satu kalimat:

> **Apakah data yang menentukan jawabannya sudah ada di tangan seseorang, dan
> boleh kita pakai?**

Kalau jawabannya *"harus kita cari sendiri dari sumber publik"* — berhenti di
situ.

---

## 10. Kondisi saat ditutup

```
432 tes lulus
33 commit di branch feat/location-intelligence-platform
Kunci Google Maps: DIHAPUS
Kunci BPS 32f2656b...: sebaiknya dihapus (sempat lewat percakapan)
Kunci OpenRouter: sebaiknya dihapus
```

Yang masih perlu dikerjakan kalau proyek benar-benar ditinggalkan: matikan 5 API
Google dan putuskan billing dari project.

### Kalau suatu saat dibuka lagi

Empat laporan atas lokasi nyata sudah tersimpan di database — Bella Casa,
Kemang, Tole Iskandar, Delima Raya. Cukup untuk ditunjukkan ke calon pembeli
tanpa perlu menjalankan apa pun.

Dan pertanyaan yang belum pernah dijawab tetap sama: **apakah ada yang mau
membayar.** Bukan "apakah datanya cukup bagus".

---

## Atribusi lisensi yang wajib dicantumkan

```
Data jalan   : © Kontributor OpenStreetMap (ODbL 1.0)
Data penduduk: WorldPop (www.worldpop.org), CC BY 4.0
Data statistik: Badan Pusat Statistik — tunduk pada ketentuan penggunaan BPS
```
