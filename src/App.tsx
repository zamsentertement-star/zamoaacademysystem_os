/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useCallback } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User as FirebaseUser } from 'firebase/auth';
import {
  LayoutDashboard,
  Users,
  CalendarCheck,
  Trophy,
  Briefcase,
  Wallet,
  ShieldCheck,
  LogOut,
  LogIn,
  Building2,
  UserCheck,
  RefreshCw,
  Bell,
  CheckCheck,
  Copy,
  ArrowRight,
  Settings,
  QrCode,
  BookOpen,
  CheckCircle2,
  Circle,
  Search,
  Sparkles,
  Lock,
  Play,
  Layers,
  RotateCcw,
  Download,
  FileText,
  MessageSquare,
  Send,
  Trash2,
  Lightbulb,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { auth, googleAuthProvider } from './lib/firebase.ts';
import {
  apiRequest,
  setInMemoryToken,
  setBranchHeader,
  getBranchHeader,
  setActAsUserHeader,
} from './lib/api.ts';
import {
  SYSTEM_ROLES,
  ROLE_PERMISSION_MATRIX,
  hasPermission,
  normalizeRoleCode,
  DomainCode,
  PermissionAction,
  RoleCode,
} from './lib/rbac.ts';
import { SystemState, getEffectiveAppSettings } from './types/system.ts';
import {
  LoadingState,
  ErrorState,
  UnauthorizedState,
  Drawer,
  Modal,
} from './components/ui/Primitives.tsx';
import {
  formatDigitalNotificationCard,
  requestBrowserNotificationPermission,
  sendBrowserDigitalNotification,
} from './lib/digitalNotifications.ts';
import { DashboardView } from './features/DashboardView.tsx';
import { AthletesParentsView } from './features/AthletesParentsView.tsx';
import { AcademyTrainingView } from './features/AcademyTrainingView.tsx';
import { CompetitionMedicalView } from './features/CompetitionMedicalView.tsx';
import { HrPayrollInventoryView } from './features/HrPayrollInventoryView.tsx';
import { FinanceAccountingView } from './features/FinanceAccountingView.tsx';
import { CommDocsReportsAdminView } from './features/CommDocsReportsAdminView.tsx';
import { AppSettingsView } from './features/AppSettingsView.tsx';
import { DigitalQrPassHub } from './components/ui/DigitalQrPassHub.tsx';

type NavSection =
  | 'dashboard'
  | 'athletes'
  | 'training'
  | 'competition'
  | 'hr_inventory'
  | 'finance'
  | 'comm_admin'
  | 'settings';

const NAV_ITEMS: Array<{
  id: NavSection;
  label: string;
  subtitle: string;
  domain: DomainCode;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: 'dashboard',
    label: 'Pusat Komando & KPI',
    subtitle: 'Executive & Operational Overview',
    domain: 'dashboard',
    icon: LayoutDashboard,
  },
  {
    id: 'athletes',
    label: 'Atlet & Orang Tua',
    subtitle: 'Biodata, Wali & Pendaftaran',
    domain: 'athletes',
    icon: Users,
  },
  {
    id: 'training',
    label: 'Akademi, Latihan & Evaluasi',
    subtitle: 'Tim, Jadwal, Presensi & Rapor',
    domain: 'training',
    icon: CalendarCheck,
  },
  {
    id: 'competition',
    label: 'Kompetisi, Prestasi & Medis',
    subtitle: 'Turnamen, Box Score & Cedera',
    domain: 'competition',
    icon: Trophy,
  },
  {
    id: 'hr_inventory',
    label: 'HR, Payroll & Inventaris',
    subtitle: 'Pelatih, Kontrak, Gaji & Stok',
    domain: 'hr',
    icon: Briefcase,
  },
  {
    id: 'finance',
    label: 'Keuangan & Akuntansi',
    subtitle: 'Invoice, Kasir, COA & Jurnal',
    domain: 'finance',
    icon: Wallet,
  },
  {
    id: 'comm_admin',
    label: 'Komunikasi, Laporan & Admin',
    subtitle: 'Pengumuman, Dokumen, RBAC & Audit',
    domain: 'communication',
    icon: ShieldCheck,
  },
  {
    id: 'settings',
    label: 'Pengaturan Aplikasi',
    subtitle: 'Profil, Cabang, Tarif, Kurikulum & COA',
    domain: 'administration',
    icon: Settings,
  },
];

interface RoleWorkflowStep {
  id: string;
  stepNumber: number;
  title: string;
  frequency: 'HARIAN' | 'PER SESI LATIHAN' | 'MINGGUAN' | 'BULANAN' | 'SAAT TRANSAKSI';
  targetNav: NavSection;
  targetModuleLabel: string;
  instruction: string;
  expectedOutput: string;
  domain: DomainCode;
  requiredAction: PermissionAction;
}

interface RoleDocumentationPlaybook {
  roleCode: RoleCode;
  headline: string;
  department: string;
  operationalSummary: string;
  primaryKpis: string[];
  bestPractices: string[];
  steps: RoleWorkflowStep[];
}

const ROLE_DOCUMENTATION_PLAYBOOKS: Record<RoleCode, RoleDocumentationPlaybook> = {
  SUPER_ADMIN: {
    roleCode: 'SUPER_ADMIN',
    headline: 'Otoritas Penuh Ekosistem Multi-Cabang, Master Data, RBAC & Audit Sistem',
    department: 'DIREKSI & ARSITEKTUR SISTEM PUSAT',
    operationalSummary:
      'Memegang kendali tertinggi atas seluruh cabang (CBTC-JKT, CBTC-BDG, CBTC-SBY), parameter aplikasi, struktur COA akuntansi, matriks izin RBAC, dan pengawasan jejak audit (System Audit Log).',
    primaryKpis: [
      'Konsolidasi Pendapatan & Kolektibilitas Lintas Cabang',
      'Kepatuhan SOP & Integritas System Audit Log (Zero Unauthorized Mutation)',
      'Rasio Kehadiran Atlet & Utilitas Skuad Seluruh Cabang',
      'Keseimbangan Neraca & Buku Besar Akuntansi Double-Entry',
    ],
    bestPractices: [
      'Gunakan filter "SEMUA CABANG (KONSOLIDASI)" di topbar untuk memantau KPI lintas kota secara real-time.',
      'Periksa tab "System Audit Log" secara berkala pada modul Komunikasi & Admin untuk meninjau perubahan data sensitif.',
      'Kelola tarif paket membership, cabang baru, dan konfigurasi fungsi kerja melalui menu Pengaturan Aplikasi (Master).',
    ],
    steps: [
      {
        id: 'sa-1',
        stepNumber: 1,
        title: 'Evaluasi Pusat Komando & Eksekusi Quick Actions Lintas Cabang',
        frequency: 'HARIAN',
        targetNav: 'dashboard',
        targetModuleLabel: 'Pusat Komando & KPI',
        instruction:
          'Pantau grafik tren kehadiran kuartal, progres Target vs Actual Revenue, jadwal latihan aktif hari ini, serta stok inventaris kritis. Gunakan panel Quick Actions untuk intervensi cepat.',
        expectedOutput: 'Keputusan taktis harian berbasis metrik real-time di seluruh cabang.',
        domain: 'dashboard',
        requiredAction: 'view',
      },
      {
        id: 'sa-2',
        stepNumber: 2,
        title: 'Konfigurasi Master Cabang, Kurikulum, Tarif & Fungsi Kerja RBAC',
        frequency: 'BULANAN',
        targetNav: 'settings',
        targetModuleLabel: 'Pengaturan Aplikasi',
        instruction:
          'Buka Pengaturan Aplikasi untuk memperbarui profil organisasi, menambah cabang, menyesuaikan tarif iuran membership, serta mengatur pemetaan jabatan pengguna.',
        expectedOutput: 'Standarisasi parameter operasional dan hak akses di seluruh cabang akademi.',
        domain: 'administration',
        requiredAction: 'manage',
      },
      {
        id: 'sa-3',
        stepNumber: 3,
        title: 'Pengawasan Buku Besar, Persetujuan Payroll & Tutup Buku',
        frequency: 'BULANAN',
        targetNav: 'finance',
        targetModuleLabel: 'Keuangan & Akuntansi',
        instruction:
          'Tinjau laporan Laba Rugi (Income Statement), Neraca (Balance Sheet), serta berikan otorisasi final pada pencairan payroll pelatih/staf dan jurnal penyesuaian.',
        expectedOutput: 'Laporan keuangan auditable dengan keseimbangan Debit = Kredit.',
        domain: 'accounting',
        requiredAction: 'approve',
      },
      {
        id: 'sa-4',
        stepNumber: 4,
        title: 'Inspeksi System Audit Log & Keamanan Operasional',
        frequency: 'MINGGUAN',
        targetNav: 'comm_admin',
        targetModuleLabel: 'Komunikasi, Laporan & Admin',
        instruction:
          'Buka tab System Audit Log untuk melacak query/mutasi database, perubahan role pengguna, serta unduh laporan CSV untuk dokumentasi tata kelola.',
        expectedOutput: 'Jejak audit transparan lengkap dengan perbandingan state sebelum & sesudah.',
        domain: 'audit',
        requiredAction: 'audit',
      },
    ],
  },
  OWNER_DIRECTOR: {
    roleCode: 'OWNER_DIRECTOR',
    headline: 'Pengawasan Eksekutif, Persetujuan Anggaran, Payroll & Evaluasi Kinerja Cabang',
    department: 'DEWAN DIREKSI & EKSEKUTIF',
    operationalSummary:
      'Memantau pertumbuhan bisnis dan prestasi olahraga akademi secara makro, menyetujui pengeluaran operasional serta penggajian (payroll), dan mengevaluasi kepatuhan audit.',
    primaryKpis: [
      'Pencapaian Target Pendapatan Tahunan & Bulanan (Target vs Actual)',
      'Pertumbuhan Atlet Aktif & Retensi Membership per Cabang',
      'Rasio Beban Operasional & Payroll terhadap Pendapatan',
      'Prestasi Turnamen & Perkembangan Evaluasi Skuad Elit',
    ],
    bestPractices: [
      'Tinjau widget Target vs Actual Revenue setiap awal dan akhir bulan untuk mengukur performa tiap cabang.',
      'Pastikan setiap pengajuan beban (expense) dan batch payroll memiliki bukti pendukung sebelum disetujui.',
      'Gunakan fitur Ekspor Ringkasan KPI CSV untuk bahan rapat evaluasi direksi.',
    ],
    steps: [
      {
        id: 'od-1',
        stepNumber: 1,
        title: 'Monitoring Executive KPI, Revenue Progress & Tren Kuartal',
        frequency: 'HARIAN',
        targetNav: 'dashboard',
        targetModuleLabel: 'Pusat Komando & KPI',
        instruction:
          'Analisis pertumbuhan penagihan kas dan tingkat kehadiran latihan per kuartal serta bandingkan performa antar cabang (Jakarta, Bandung, Surabaya).',
        expectedOutput: 'Pemetaan cabang berkinerja tinggi dan cabang yang membutuhkan dukungan.',
        domain: 'dashboard',
        requiredAction: 'view',
      },
      {
        id: 'od-2',
        stepNumber: 2,
        title: 'Otorisasi Pengeluaran (Expenses) & Laporan Keuangan',
        frequency: 'MINGGUAN',
        targetNav: 'finance',
        targetModuleLabel: 'Keuangan & Akuntansi',
        instruction:
          'Periksa daftar beban operasional cabang dan laporan buku besar, lalu berikan persetujuan (Approve) agar jurnal akuntansi terbit otomatis.',
        expectedOutput: 'Pengendalian arus kas keluar dan validitas laporan laba rugi.',
        domain: 'finance',
        requiredAction: 'approve',
      },
      {
        id: 'od-3',
        stepNumber: 3,
        title: 'Persetujuan Batch Payroll Pelatih & Staf Akademi',
        frequency: 'BULANAN',
        targetNav: 'hr_inventory',
        targetModuleLabel: 'HR, Payroll & Inventaris',
        instruction:
          'Verifikasi rekap gaji pokok dan insentif kehadiran sesi pelatih pada sub-tab Payroll sebelum pencairan kas dilakukan oleh bagian Finance.',
        expectedOutput: 'Slip gaji resmi terverifikasi dan terjurnal pada akun beban gaji.',
        domain: 'payroll',
        requiredAction: 'approve',
      },
      {
        id: 'od-4',
        stepNumber: 4,
        title: 'Peninjauan Laporan Eksekutif & Jejak Audit',
        frequency: 'BULANAN',
        targetNav: 'comm_admin',
        targetModuleLabel: 'Komunikasi, Laporan & Admin',
        instruction:
          'Periksa dokumen kebijakan akademi, siaran pengumuman strategis, dan riwayat aktivitas di System Audit Log.',
        expectedOutput: 'Tata kelola organisasi yang akuntabel dan terdokumentasi.',
        domain: 'audit',
        requiredAction: 'view',
      },
    ],
  },
  INVESTOR: {
    roleCode: 'INVESTOR',
    headline: 'Transparansi Kinerja Finansial, Pertumbuhan Populasi Atlet & Rekam Prestasi',
    department: 'PEMANGKU KEPENTINGAN & INVESTOR',
    operationalSummary:
      'Akses baca terstruktur (read-only & export) terhadap metrik pertumbuhan akademi, realisasi pendapatan, laporan akuntansi standar, dan pencapaian kompetitif atlet.',
    primaryKpis: [
      'Pertumbuhan Pendapatan Kuartalan & Tingkat Kolektibilitas',
      'Jumlah Populasi Atlet Aktif per Kelompok Umur (KU)',
      'Surplus/Defisit Operasional pada Laporan Laba Rugi',
      'Perolehan Medali & Rekor Pertandingan Turnamen Resmi',
    ],
    bestPractices: [
      'Gunakan tombol Ekspor CSV pada Dashboard dan Modul Keuangan untuk mengunduh data analisis investasi.',
      'Bandingkan rasio utilisasi kapasitas skuad antar cabang untuk melihat potensi ekspansi.',
    ],
    steps: [
      {
        id: 'inv-1',
        stepNumber: 1,
        title: 'Tinjau Pertumbuhan Finansial & Kehadiran Kuartal Berjalan',
        frequency: 'MINGGUAN',
        targetNav: 'dashboard',
        targetModuleLabel: 'Pusat Komando & KPI',
        instruction:
          'Amati grafik Recharts pada Pusat Komando untuk melihat korelasi antara tingkat kehadiran latihan atlet dengan pertumbuhan penerimaan kas.',
        expectedOutput: 'Visibilitas real-time terhadap kesehatan operasional akademi.',
        domain: 'dashboard',
        requiredAction: 'view',
      },
      {
        id: 'inv-2',
        stepNumber: 2,
        title: 'Inspeksi Neraca, Laba Rugi & Arus Tagihan Membership',
        frequency: 'BULANAN',
        targetNav: 'finance',
        targetModuleLabel: 'Keuangan & Akuntansi',
        instruction:
          'Buka modul Keuangan & Akuntansi untuk meninjau struktur pendapatan, piutang iuran yang belum tertagih, serta saldo kas/bank.',
        expectedOutput: 'Transparansi laporan finansial berbasis standar double-entry.',
        domain: 'accounting',
        requiredAction: 'view',
      },
      {
        id: 'inv-3',
        stepNumber: 3,
        title: 'Evaluasi Portofolio Prestasi Turnamen & Perkembangan Talenta',
        frequency: 'BULANAN',
        targetNav: 'competition',
        targetModuleLabel: 'Kompetisi, Prestasi & Medis',
        instruction:
          'Lihat rekap kemenangan pertandingan, turnamen yang diikuti, serta penghargaan yang diraih skuad ZAMOA CBTC.',
        expectedOutput: 'Tolok ukur reputasi dan nilai merek (brand equity) akademi.',
        domain: 'competition',
        requiredAction: 'view',
      },
    ],
  },
  OPERATIONS_MANAGER: {
    roleCode: 'OPERATIONS_MANAGER',
    headline: 'Manajemen Operasional Cabang, Penjadwalan Latihan, Skuad, HR & Logistik',
    department: 'MANAJEMEN OPERASIONAL CABANG',
    operationalSummary:
      'Mengelola kelancaran operasional harian cabang mulai dari penjadwalan sesi latihan, alokasi lapangan & pelatih, registrasi atlet, hingga pemeliharaan stok inventaris peralatan.',
    primaryKpis: [
      'Keterlaksanaan Jadwal Latihan Harian (0 Bentrok Lapangan/Pelatih)',
      'Ketersediaan Stok Peralatan & Medis di Atas Ambang Minimum (minStock)',
      'Tingkat Kehadiran Pelatih, Staf & Atlet per Sesi',
      'Kecepatan Penyelesaian Kebutuhan Operasional Cabang',
    ],
    bestPractices: [
      'Periksa widget "Jadwal Latihan Hari Ini" dan "Ringkasan Inventaris Kritis" setiap pagi sebelum sesi sore dimulai.',
      'Gunakan formulir modal "Input Sesi Latihan Baru" yang dilengkapi deteksi konflik otomatis agar tidak terjadi jadwal ganda.',
      'Segera lakukan restock pada SKU yang muncul di daftar Inventaris Kritis.',
    ],
    steps: [
      {
        id: 'om-1',
        stepNumber: 1,
        title: 'Kontrol Jadwal Latihan Hari Ini & Inventaris Kritis di Dashboard',
        frequency: 'HARIAN',
        targetNav: 'dashboard',
        targetModuleLabel: 'Pusat Komando & KPI',
        instruction:
          'Pilih filter cabang kerja Anda, periksa sesi yang berstatus SCHEDULED/ONGOING hari ini, dan pantau indikator defisit stok barang logistik.',
        expectedOutput: 'Kesiapan lapangan dan peralatan 100% sebelum sesi latihan dimulai.',
        domain: 'dashboard',
        requiredAction: 'view',
      },
      {
        id: 'om-2',
        stepNumber: 2,
        title: 'Penyusunan Jadwal Sesi Latihan Baru & Manajemen Skuad',
        frequency: 'MINGGUAN',
        targetNav: 'training',
        targetModuleLabel: 'Akademi, Latihan & Evaluasi',
        instruction:
          'Klik tombol "+ Input Sesi Latihan Baru", pilih cabang, tim, pelatih PIC, lapangan, dan jam latihan. Aktifkan pengingat WhatsApp otomatis ke orang tua.',
        expectedOutput: 'Jadwal latihan bebas bentrok dan ternotifikasi ke seluruh wali atlet.',
        domain: 'training',
        requiredAction: 'create',
      },
      {
        id: 'om-3',
        stepNumber: 3,
        title: 'Pengelolaan Kontrak Pelatih, Presensi Staf & Mutasi Inventaris',
        frequency: 'MINGGUAN',
        targetNav: 'hr_inventory',
        targetModuleLabel: 'HR, Payroll & Inventaris',
        instruction:
          'Catat pengadaan (restock) atau pemakaian barang inventaris serta pantau penugasan pelatih dan staf cabang.',
        expectedOutput: 'Buku besar stok logistik akurat dan kesiapan SDM terjaga.',
        domain: 'inventory',
        requiredAction: 'process',
      },
      {
        id: 'om-4',
        stepNumber: 4,
        title: 'Publikasi Pengumuman Operasional Cabang',
        frequency: 'SAAT TRANSAKSI',
        targetNav: 'comm_admin',
        targetModuleLabel: 'Komunikasi, Laporan & Admin',
        instruction:
          'Siarkan pengumuman perubahan jadwal, info cuaca/lapangan, atau agenda rapat orang tua melalui modul Komunikasi.',
        expectedOutput: 'Notifikasi digital diterima secara instan oleh target role terkait.',
        domain: 'communication',
        requiredAction: 'create',
      },
    ],
  },
  FINANCE: {
    roleCode: 'FINANCE',
    headline: 'Penagihan Membership (Billing), Kasir, Payroll & Akuntansi Double-Entry',
    department: 'KEUANGAN, KASIR & AKUNTANSI',
    operationalSummary:
      'Bertanggung jawab atas siklus pendapatan iuran atlet, verifikasi pembayaran masuk, pencatatan beban operasional, penggajian, hingga rekonsiliasi jurnal umum dan buku besar.',
    primaryKpis: [
      'Rasio Kolektibilitas Invoice Bulanan (Collection Rate %)',
      'Penurunan Saldo Piutang Tertunggak (Overdue Invoices)',
      'Akurasi Rekonsiliasi Kas/Bank & Keseimbangan Neraca Saldo',
      'Ketepatan Waktu Penerbitan Invoice & Pencairan Payroll',
    ],
    bestPractices: [
      'Gunakan fitur "Penerbitan Invoice Cepat" atau "Verifikasi Pembayaran" pada Quick Actions Dashboard untuk transaksi kasir harian.',
      'Setiap pembayaran yang diverifikasi otomatis membentuk Jurnal Umum Double-Entry (Debit Kas/Bank, Kredit Piutang/Pendapatan).',
      'Periksa tab Buku Besar (General Ledger) dan Neraca sebelum menutup periode akuntansi bulanan.',
    ],
    steps: [
      {
        id: 'fin-1',
        stepNumber: 1,
        title: 'Penerbitan Invoice Membership & Pengingat Tagihan WhatsApp',
        frequency: 'BULANAN',
        targetNav: 'finance',
        targetModuleLabel: 'Keuangan & Akuntansi',
        instruction:
          'Terbitkan invoice bulanan untuk atlet aktif sesuai paket membership, lalu kirimkan notifikasi tagihan digital/WhatsApp kepada orang tua.',
        expectedOutput: 'Invoice resmi terbit dan tercatat pada daftar piutang usaha.',
        domain: 'finance',
        requiredAction: 'create',
      },
      {
        id: 'fin-2',
        stepNumber: 2,
        title: 'Verifikasi Pembayaran Masuk (Lunas / Cicilan Parsial)',
        frequency: 'HARIAN',
        targetNav: 'finance',
        targetModuleLabel: 'Keuangan & Akuntansi',
        instruction:
          'Pilih invoice yang dibayar oleh wali atlet, masukkan nominal serta metode pembayaran (Transfer/QRIS/Tunai), dan simpan transaksi.',
        expectedOutput: 'Status invoice diperbarui menjadi PAID/PARTIAL dan jurnal kas otomatis terbentuk.',
        domain: 'finance',
        requiredAction: 'process',
      },
      {
        id: 'fin-3',
        stepNumber: 3,
        title: 'Pemrosesan Gaji (Payroll) & Pencatatan Beban Operasional',
        frequency: 'BULANAN',
        targetNav: 'hr_inventory',
        targetModuleLabel: 'HR, Payroll & Inventaris',
        instruction:
          'Hitung kompensasi bulanan pelatih & staf berdasarkan tarif kontrak dan jumlah sesi kehadiran, lalu ajukan persetujuan pencairan.',
        expectedOutput: 'Perhitungan payroll akurat dan siap dijurnal ke beban operasional.',
        domain: 'payroll',
        requiredAction: 'process',
      },
      {
        id: 'fin-4',
        stepNumber: 4,
        title: 'Audit Jurnal Umum, COA, Laba Rugi & Neraca Keuangan',
        frequency: 'BULANAN',
        targetNav: 'finance',
        targetModuleLabel: 'Keuangan & Akuntansi',
        instruction:
          'Buka sub-tab Akuntansi Double-Entry untuk meninjau daftar akun (COA), entri jurnal manual/otomatis, Trial Balance, dan Laporan Laba Rugi.',
        expectedOutput: 'Laporan keuangan berimbang (Balanced) dan siap diaudit.',
        domain: 'accounting',
        requiredAction: 'audit',
      },
    ],
  },
  ADMIN: {
    roleCode: 'ADMIN',
    headline: 'Sekretariat Cabang: Pendaftaran Atlet, Data Wali, Presensi & Layanan Harian',
    department: 'SEKRETARIAT & ADMINISTRASI CABANG',
    operationalSummary:
      'Garda terdepan pelayanan administrasi cabang: melayani pendaftaran atlet baru (online/offline), mengelola biodata & dokumen wali, membantu input presensi, serta menerbitkan tagihan awal.',
    primaryKpis: [
      'Kecepatan Onboarding Pendaftaran Atlet Baru & Verifikasi Pasfoto',
      'Kelengkapan Data Kontak Darurat & Wali Resmi Atlet',
      'Ketepatan Pencatatan Presensi Sesi Latihan Harian',
      'Ketertiban Arsip Dokumen & Pengumuman Cabang',
    ],
    bestPractices: [
      'Manfaatkan panel "Quick Actions" di Dashboard untuk "Tambah Atlet Baru", "Input Presensi Cepat", dan "Penerbitan Invoice Cepat" dalam satu klik.',
      'Pastikan nomor telepon WhatsApp orang tua/wali diisi dengan benar saat registrasi agar notifikasi jadwal dan invoice terkirim otomatis.',
      'Cetak atau bagikan Kartu QR Digital kepada atlet baru melalui tombol "Kartu QR Saya & Personel".',
    ],
    steps: [
      {
        id: 'adm-1',
        stepNumber: 1,
        title: 'Registrasi Atlet Baru & Penautan Orang Tua/Wali',
        frequency: 'HARIAN',
        targetNav: 'athletes',
        targetModuleLabel: 'Atlet & Orang Tua',
        instruction:
          'Input biodata atlet baru, ukuran jersey, posisi bermain, kelompok umur, tim, serta kontak wali dan paket membership awal.',
        expectedOutput: 'Atlet terdaftar dengan Nomor Induk, Kartu QR Digital, dan akun wali terhubung.',
        domain: 'athletes',
        requiredAction: 'create',
      },
      {
        id: 'adm-2',
        stepNumber: 2,
        title: 'Penjadwalan Sesi & Pencatatan Presensi Kehadiran Harian',
        frequency: 'PER SESI LATIHAN',
        targetNav: 'training',
        targetModuleLabel: 'Akademi, Latihan & Evaluasi',
        instruction:
          'Pastikan sesi latihan hari ini telah terjadwal, kemudian catat kehadiran atlet (PRESENT, LATE, EXCUSED, ABSENT) atau pindai QR Pass.',
        expectedOutput: 'Rekap kehadiran sesi tersimpan dan rasio presensi terbarui otomatis.',
        domain: 'attendance',
        requiredAction: 'create',
      },
      {
        id: 'adm-3',
        stepNumber: 3,
        title: 'Penerbitan Invoice Pendaftaran / Iuran Bulanan',
        frequency: 'SAAT TRANSAKSI',
        targetNav: 'finance',
        targetModuleLabel: 'Keuangan & Akuntansi',
        instruction:
          'Buat tagihan membership untuk atlet yang baru mendaftar atau perpanjangan bulan berjalan agar dapat segera dibayarkan wali.',
        expectedOutput: 'Invoice bernomor unik terbit dan siap diverifikasi bagian kasir.',
        domain: 'finance',
        requiredAction: 'create',
      },
      {
        id: 'adm-4',
        stepNumber: 4,
        title: 'Pengelolaan Dokumen Surat Izin & Pengumuman Sekretariat',
        frequency: 'MINGGUAN',
        targetNav: 'comm_admin',
        targetModuleLabel: 'Komunikasi, Laporan & Admin',
        instruction:
          'Unggah dokumen surat persetujuan orang tua, regulasi akademi, dan kirimkan informasi jadwal latihan mingguan.',
        expectedOutput: 'Penyimpanan dokumen terpusat dan komunikasi wali terkoordinasi.',
        domain: 'documents',
        requiredAction: 'create',
      },
    ],
  },
  HEAD_COACH: {
    roleCode: 'HEAD_COACH',
    headline: 'Kepemimpinan Teknis Kepelatihan, Kurikulum, Evaluasi Skuad & Strategi Kompetisi',
    department: 'DEPARTEMEN KEPELATIHAN UTAMA',
    operationalSummary:
      'Merancang kurikulum program latihan per kelompok umur, memimpin sesi latihan, mengawasi standar evaluasi rapor teknis/fisik atlet, serta menentukan roster utama turnamen.',
    primaryKpis: [
      'Peningkatan Skor Rata-Rata Evaluasi Keterampilan & Fisik Atlet',
      'Tingkat Kepatuhan Eksekusi Kurikulum Latihan Mingguan',
      'Persentase Kemenangan (Win Rate) & Efisiensi Taktik di Kompetisi',
      'Kesiapan Fisik Skuad (Kepatuhan Rekomendasi Return-to-Play Medis)',
    ],
    bestPractices: [
      'Susun jadwal sesi latihan dengan topik drill yang spesifik pada modul Akademi & Latihan.',
      'Selalu periksa status cedera/RTP atlet sebelum memasukkan pemain ke dalam roster turnamen atau latihan kontak penuh.',
      'Lakukan evaluasi berkala menggunakan parameter penilaian terukur (Ball Handling, Shooting, Defense, Basketball IQ, Conditioning).',
    ],
    steps: [
      {
        id: 'hc-1',
        stepNumber: 1,
        title: 'Perencanaan Kurikulum & Penjadwalan Sesi Latihan Skuad',
        frequency: 'MINGGUAN',
        targetNav: 'training',
        targetModuleLabel: 'Akademi, Latihan & Evaluasi',
        instruction:
          'Buka modul Akademi & Latihan, susun program latihan musiman, dan jadwalkan sesi latihan tim beserta fokus drill taktikal.',
        expectedOutput: 'Kurikulum latihan terstruktur untuk setiap Kelompok Umur (KU).',
        domain: 'training',
        requiredAction: 'manage',
      },
      {
        id: 'hc-2',
        stepNumber: 2,
        title: 'Pelaksanaan Sesi, Presensi Lapangan & Catatan Intensitas (RPE)',
        frequency: 'PER SESI LATIHAN',
        targetNav: 'training',
        targetModuleLabel: 'Akademi, Latihan & Evaluasi',
        instruction:
          'Verifikasi kehadiran pemain di lapangan, catat tingkat beban latihan (RPE), serta evaluasi respons taktikal skuad.',
        expectedOutput: 'Log latihan lapangan lengkap dengan metrik kehadiran dan beban kerja.',
        domain: 'attendance',
        requiredAction: 'process',
      },
      {
        id: 'hc-3',
        stepNumber: 3,
        title: 'Penilaian Rapor Perkembangan Atlet & Target Individual (IDP)',
        frequency: 'BULANAN',
        targetNav: 'training',
        targetModuleLabel: 'Akademi, Latihan & Evaluasi',
        instruction:
          'Input nilai evaluasi perkembangan pemain dan tetapkan Individual Development Plan (IDP) agar dapat dipantau orang tua dan atlet.',
        expectedOutput: 'Rapor evaluasi kuartalan/bulanan resmi untuk setiap atlet.',
        domain: 'development',
        requiredAction: 'approve',
      },
      {
        id: 'hc-4',
        stepNumber: 4,
        title: 'Seleksi Roster Turnamen & Analisis Box Score Pertandingan',
        frequency: 'SAAT TRANSAKSI',
        targetNav: 'competition',
        targetModuleLabel: 'Kompetisi, Prestasi & Medis',
        instruction:
          'Daftarkan skuad ke turnamen resmi, catat hasil skor kuarter, dan analisis statistik performa individu (PTS, REB, AST, STL, BLK).',
        expectedOutput: 'Rekam jejak statistik kompetisi akurat sebagai dasar pembinaan.',
        domain: 'competition',
        requiredAction: 'manage',
      },
    ],
  },
  COACH: {
    roleCode: 'COACH',
    headline: 'Eksekusi Latihan Lapangan, Input Presensi, Evaluasi Pemain & Statistik Tanding',
    department: 'TIM PELATIH LAPANGAN',
    operationalSummary:
      'Melaksanakan program latihan harian di lapangan, mencatat presensi atlet secara cepat, mengisi rapor evaluasi keterampilan pemain, dan mendokumentasikan statistik pertandingan.',
    primaryKpis: [
      'Ketepatan Waktu Pelaksanaan Sesi & Kelengkapan Presensi 100%',
      'Penyelesaian Input Rapor Evaluasi Perkembangan Atlet Tepat Waktu',
      'Pencatatan Box Score Pertandingan & Target Latihan Individu',
    ],
    bestPractices: [
      'Gunakan tombol "Input Presensi Cepat" di Dashboard atau pindai QR Pass atlet sesaat sebelum pemanasan dimulai.',
      'Catat observasi teknik spesifik pada kolom catatan pelatih saat mengisi evaluasi agar pemain tahu aspek yang harus diperbaiki.',
    ],
    steps: [
      {
        id: 'co-1',
        stepNumber: 1,
        title: 'Cek Jadwal Latihan Hari Ini & Input Presensi Cepat',
        frequency: 'PER SESI LATIHAN',
        targetNav: 'dashboard',
        targetModuleLabel: 'Pusat Komando & KPI',
        instruction:
          'Lihat penugasan lapangan pada widget Jadwal Latihan Hari Ini, lalu klik "Input Presensi Cepat" untuk mengabsen atlet.',
        expectedOutput: 'Kehadiran atlet tercatat real-time sebelum drill inti dimulai.',
        domain: 'attendance',
        requiredAction: 'create',
      },
      {
        id: 'co-2',
        stepNumber: 2,
        title: 'Input Rapor Evaluasi Teknik, Fisik & Target Latihan (Goals)',
        frequency: 'BULANAN',
        targetNav: 'training',
        targetModuleLabel: 'Akademi, Latihan & Evaluasi',
        instruction:
          'Buka sub-tab Evaluasi & Rapor pada modul Akademi, pilih atlet binaan Anda, dan berikan skor penilaian objektif beserta rekomendasi.',
        expectedOutput: 'Data perkembangan keterampilan atlet terbarui secara historis.',
        domain: 'development',
        requiredAction: 'create',
      },
      {
        id: 'co-3',
        stepNumber: 3,
        title: 'Pencatatan Skor & Statistik Pertandingan (Box Score)',
        frequency: 'SAAT TRANSAKSI',
        targetNav: 'competition',
        targetModuleLabel: 'Kompetisi, Prestasi & Medis',
        instruction:
          'Masukkan hasil pertandingan persahabatan/turnamen dan statistik individu pemain setelah laga selesai.',
        expectedOutput: 'Statistik tanding tersimpan pada profil masing-masing atlet.',
        domain: 'competition',
        requiredAction: 'create',
      },
    ],
  },
  MEDICAL_STAFF: {
    roleCode: 'MEDICAL_STAFF',
    headline: 'Manajemen Kesehatan Atlet, Observasi Cedera, Fisioterapi & Otorisasi Return-to-Play',
    department: 'TIM MEDIS & SPORT SCIENCE',
    operationalSummary:
      'Mengelola rekam medis atlet, mencatat insiden cedera latihan/pertandingan, menyusun protokol rehabilitasi fisioterapi, dan menetapkan status kelaikan bermain (Return-to-Play / RTP).',
    primaryKpis: [
      'Waktu Tanggap Penanganan & Pencatatan Insiden Cedera (< 15 Menit)',
      'Akurasi Pemantauan Status Return-to-Play (OUT, LIMITED, FULL_CLEARANCE)',
      'Kelengkapan Profil Medis Dasar (Golongan Darah, Alergi, Riwayat Asuransi)',
    ],
    bestPractices: [
      'Setiap perubahan status RTP otomatis terlihat oleh pelatih di Dashboard dan Modul Kompetisi agar atlet yang belum pulih tidak dipaksakan bertanding.',
      'Gunakan Quick Action "Input Cedera & Status RTP" di Dashboard untuk pelaporan darurat langsung dari tepi lapangan.',
    ],
    steps: [
      {
        id: 'med-1',
        stepNumber: 1,
        title: 'Pencatatan Insiden Cedera Baru & Diagnosis Awal',
        frequency: 'SAAT TRANSAKSI',
        targetNav: 'competition',
        targetModuleLabel: 'Kompetisi, Prestasi & Medis',
        instruction:
          'Buka tab Medis & Fisioterapi (atau Quick Action Medis di Dashboard), pilih atlet, catat area anatomi cedera, tingkat keparahan, dan tindakan awal.',
        expectedOutput: 'Log cedera aktif tercatat dan memberi peringatan ke tim pelatih.',
        domain: 'medical',
        requiredAction: 'create',
      },
      {
        id: 'med-2',
        stepNumber: 2,
        title: 'Pembaruan Tahap Rehabilitasi & Otorisasi Status Return-to-Play (RTP)',
        frequency: 'MINGGUAN',
        targetNav: 'competition',
        targetModuleLabel: 'Kompetisi, Prestasi & Medis',
        instruction:
          'Evaluasi perkembangan pemulihan atlet dan perbarui status RTP dari OUT / REHAB menjadi LIMITED_TRAINING atau CLEARED.',
        expectedOutput: 'Otorisasi medis resmi bagi pelatih terkait batas beban latihan atlet.',
        domain: 'medical',
        requiredAction: 'update',
      },
      {
        id: 'med-3',
        stepNumber: 3,
        title: 'Pemeriksaan Fisik Berkala & Arsip Dokumen Medis',
        frequency: 'BULANAN',
        targetNav: 'athletes',
        targetModuleLabel: 'Atlet & Orang Tua',
        instruction:
          'Tinjau antropometri (tinggi/berat badan), riwayat alergi, serta unggah dokumen surat keterangan medis pada modul Dokumen.',
        expectedOutput: 'Rekam medis komprehensif untuk keselamatan latihan jangka panjang.',
        domain: 'medical',
        requiredAction: 'view',
      },
    ],
  },
  EVENT_STAFF: {
    roleCode: 'EVENT_STAFF',
    headline: 'Koordinasi Turnamen, Penjadwalan Pertandingan, Logistik Event & Dokumentasi',
    department: 'MANAJEMEN KOMPETISI & EVENT',
    operationalSummary:
      'Mengatur keikutsertaan skuad dalam kompetisi eksternal maupun penyelenggaraan turnamen internal, mengelola jadwal tanding, kebutuhan logistik pertandingan, dan publikasi hasil.',
    primaryKpis: [
      'Kelancaran Penyelenggaraan & Registrasi Turnamen Skuad',
      'Kelengkapan Dokumentasi Hasil Pertandingan & Penghargaan (Achievements)',
      'Ketersediaan Peralatan Pertandingan (Jersey, Bola Resmi FIBA, Perangkat Meja)',
    ],
    bestPractices: [
      'Pastikan daftar roster pemain untuk turnamen telah terverifikasi bebas tunggakan dan bebas cedera berat.',
      'Catat setiap pencapaian trofi/penghargaan tim maupun MVP individu segera setelah turnamen berakhir.',
    ],
    steps: [
      {
        id: 'ev-1',
        stepNumber: 1,
        title: 'Pembuatan Event Turnamen & Pendaftaran Roster Skuad',
        frequency: 'SAAT TRANSAKSI',
        targetNav: 'competition',
        targetModuleLabel: 'Kompetisi, Prestasi & Medis',
        instruction:
          'Tambahkan turnamen baru, tentukan kategori kelompok umur, dan daftarkan atlet yang masuk ke dalam roster pertandingan.',
        expectedOutput: 'Skuad terdaftar resmi pada jadwal kompetisi akademi.',
        domain: 'competition',
        requiredAction: 'create',
      },
      {
        id: 'ev-2',
        stepNumber: 2,
        title: 'Persiapan Logistik Pertandingan & Mutasi Peralatan Event',
        frequency: 'MINGGUAN',
        targetNav: 'hr_inventory',
        targetModuleLabel: 'HR, Payroll & Inventaris',
        instruction:
          'Periksa stok bola tanding, rompi scrimmage, dan perlengkapan medis lapangan pada modul Inventaris sebelum keberangkatan tim.',
        expectedOutput: 'Log pengeluaran dan pengembalian peralatan event tercatat rapi.',
        domain: 'inventory',
        requiredAction: 'process',
      },
      {
        id: 'ev-3',
        stepNumber: 3,
        title: 'Publikasi Hasil Laga, Galeri Media & Pengumuman Event',
        frequency: 'SAAT TRANSAKSI',
        targetNav: 'comm_admin',
        targetModuleLabel: 'Komunikasi, Laporan & Admin',
        instruction:
          'Bagikan jadwal keberangkatan tanding dan publikasikan hasil pencapaian turnamen kepada komunitas orang tua dan atlet.',
        expectedOutput: 'Informasi event tersampaikan tepat waktu ke seluruh peserta.',
        domain: 'communication',
        requiredAction: 'create',
      },
    ],
  },
  PARENT: {
    roleCode: 'PARENT',
    headline: 'Portal Orang Tua/Wali: Monitoring Kehadiran, Rapor Evaluasi, Medis & Tagihan Anak',
    department: 'KOMUNITAS ORANG TUA & WALI ATLET',
    operationalSummary:
      'Memantau perkembangan putra/putri di akademi secara transparan: melihat jadwal latihan hari ini, riwayat presensi, nilai rapor evaluasi pelatih, kondisi medis, dan status invoice membership.',
    primaryKpis: [
      'Tingkat Kehadiran Latihan Putra/Putri (> 85% per Kuartal)',
      'Perkembangan Nilai Rapor Evaluasi Keterampilan & Karakter',
      'Ketepatan Waktu Pembayaran Iuran Membership Bulanan',
    ],
    bestPractices: [
      'Periksa jadwal latihan aktif dan pengumuman terbaru dari manajemen akademi melalui Dashboard dan Pusat Notifikasi Digital.',
      'Simpan Kartu QR Digital putra/putri Anda di ponsel untuk memudahkan pemindaian presensi di lapangan.',
    ],
    steps: [
      {
        id: 'par-1',
        stepNumber: 1,
        title: 'Pantau Profil Anak, Kartu QR Digital & Pembaruan Kontak Wali',
        frequency: 'BULANAN',
        targetNav: 'athletes',
        targetModuleLabel: 'Atlet & Orang Tua',
        instruction:
          'Periksa ketepatan biodata anak, ukuran jersey, kontak darurat, serta unduh Kartu ID QR Digital untuk presensi.',
        expectedOutput: 'Data wali dan kontak darurat selalu mutakhir.',
        domain: 'parents',
        requiredAction: 'update',
      },
      {
        id: 'par-2',
        stepNumber: 2,
        title: 'Cek Jadwal Latihan, Riwayat Presensi & Rapor Evaluasi Pelatih',
        frequency: 'MINGGUAN',
        targetNav: 'training',
        targetModuleLabel: 'Akademi, Latihan & Evaluasi',
        instruction:
          'Lihat jadwal sesi latihan skuad anak Anda, pantau rekap kehadiran, dan baca catatan umpan balik dari pelatih pada Rapor Evaluasi.',
        expectedOutput: 'Kolaborasi aktif antara orang tua dan pelatih dalam pembinaan anak.',
        domain: 'training',
        requiredAction: 'view',
      },
      {
        id: 'par-3',
        stepNumber: 3,
        title: 'Pemeriksaan Status Invoice Membership & Bukti Pembayaran',
        frequency: 'BULANAN',
        targetNav: 'finance',
        targetModuleLabel: 'Keuangan & Akuntansi',
        instruction:
          'Buka modul Keuangan untuk melihat daftar tagihan iuran membership yang jatuh tempo maupun riwayat pembayaran yang telah lunas.',
        expectedOutput: 'Status keanggotaan anak tetap aktif tanpa kendala administrasi.',
        domain: 'finance',
        requiredAction: 'view',
      },
    ],
  },
  ATHLETE: {
    roleCode: 'ATHLETE',
    headline: 'Portal Atlet: Jadwal Latihan, Kartu QR Presensi, Rapor Evaluasi & Statistik Tanding',
    department: 'ATLET & PEMAIN SKUAD AKADEMI',
    operationalSummary:
      'Akses mandiri bagi atlet untuk mengecek jadwal sesi latihan, menunjukkan Kartu QR saat absensi, memantau progres target latihan pribadi (IDP), serta melihat statistik pertandingan.',
    primaryKpis: [
      'Kedisiplinan Kehadiran Latihan Tepat Waktu (Zero Unexcused Absence)',
      'Pencapaian Target Latihan Individu (Individual Development Goals)',
      'Kontribusi Statistik Pertandingan & Kebugaran Fisik',
    ],
    bestPractices: [
      'Buka tombol "Kartu QR Saya & Personel" di kanan atas sebelum masuk lapangan untuk pemindaian presensi cepat.',
      'Pelajari catatan evaluasi dari pelatih setiap bulan untuk fokus memperbaiki aspek teknik yang masih kurang.',
    ],
    steps: [
      {
        id: 'ath-1',
        stepNumber: 1,
        title: 'Cek Jadwal Latihan Hari Ini & Lokasi Lapangan di Dashboard',
        frequency: 'HARIAN',
        targetNav: 'dashboard',
        targetModuleLabel: 'Pusat Komando & KPI',
        instruction:
          'Periksa widget Jadwal Latihan Hari Ini untuk mengetahui jam mulai, nama lapangan (Court), pelatih PIC, dan fokus materi drill.',
        expectedOutput: 'Persiapan perlengkapan dan kehadiran tepat waktu sebelum sesi dimulai.',
        domain: 'dashboard',
        requiredAction: 'view',
      },
      {
        id: 'ath-2',
        stepNumber: 2,
        title: 'Tinjau Rapor Evaluasi Keterampilan & Target Individual (Goals)',
        frequency: 'MINGGUAN',
        targetNav: 'training',
        targetModuleLabel: 'Akademi, Latihan & Evaluasi',
        instruction:
          'Buka modul Akademi & Latihan untuk melihat perkembangan nilai teknik/fisik Anda serta target latihan yang diberikan pelatih.',
        expectedOutput: 'Fokus latihan mandiri yang terarah sesuai arahan pelatih.',
        domain: 'development',
        requiredAction: 'view',
      },
      {
        id: 'ath-3',
        stepNumber: 3,
        title: 'Pantau Jadwal Turnamen, Rekor Tim & Statistik Box Score Pribadi',
        frequency: 'SAAT TRANSAKSI',
        targetNav: 'competition',
        targetModuleLabel: 'Kompetisi, Prestasi & Medis',
        instruction:
          'Lihat jadwal pertandingan turnamen mendatang, catatan poin/rebound/assist pribadi, serta rekomendasi kebugaran medis.',
        expectedOutput: 'Motivasi berprestasi berbasis data statistik resmi.',
        domain: 'competition',
        requiredAction: 'view',
      },
    ],
  },
};

const ALL_DOMAINS_LIST: Array<{ code: DomainCode; label: string }> = [
  { code: 'dashboard', label: 'Dashboard & KPI' },
  { code: 'athletes', label: 'Data Atlet' },
  { code: 'parents', label: 'Data Orang Tua/Wali' },
  { code: 'teams', label: 'Skuad & Tim' },
  { code: 'age_groups', label: 'Kelompok Umur (KU)' },
  { code: 'training', label: 'Program & Sesi Latihan' },
  { code: 'attendance', label: 'Presensi Kehadiran' },
  { code: 'development', label: 'Rapor Evaluasi & IDP' },
  { code: 'competition', label: 'Kompetisi & Turnamen' },
  { code: 'medical', label: 'Medis & Status RTP' },
  { code: 'hr', label: 'SDM, Pelatih & Staf' },
  { code: 'payroll', label: 'Penggajian (Payroll)' },
  { code: 'inventory', label: 'Inventaris & Logistik' },
  { code: 'finance', label: 'Billing, Invoice & Kasir' },
  { code: 'accounting', label: 'Akuntansi Double-Entry' },
  { code: 'communication', label: 'Pengumuman & Siaran' },
  { code: 'documents', label: 'Dokumen & Arsip' },
  { code: 'reports', label: 'Laporan & Ekspor CSV' },
  { code: 'administration', label: 'Pengaturan Master' },
  { code: 'audit', label: 'System Audit Log' },
];

export interface StepMentorComment {
  id: string;
  stepId: string;
  authorName: string;
  authorRole: string;
  authorTitle?: string;
  isMentorTip: boolean;
  content: string;
  createdAt: string;
}

export const DEFAULT_STEP_MENTOR_COMMENTS: Record<string, StepMentorComment[]> = {
  'sa-1': [
    {
      id: 'mc-sa-1-1',
      stepId: 'sa-1',
      authorName: 'Coach Zamoa / Dewan Direksi',
      authorRole: 'SUPER_ADMIN',
      authorTitle: 'Chief Executive Officer',
      isMentorTip: true,
      content:
        'Tips Mentor: Lakukan pengecekan System Audit Log sebelum dan sesudah sinkronisasi cabang atau penyesuaian saldo awal bulan untuk memastikan integritas data terjamin.',
      createdAt: '2026-09-28T08:30:00Z',
    },
  ],
  'sa-3': [
    {
      id: 'mc-sa-3-1',
      stepId: 'sa-3',
      authorName: 'Bambang Soedirman',
      authorRole: 'SUPER_ADMIN',
      authorTitle: 'Direktur Kepatuhan & Audit',
      isMentorTip: false,
      content:
        'Catatan Operasional: Jangan pernah menghapus entri audit log tanpa persetujuan tertulis 2 Direktur. Gunakan fitur "Unduh Log Audit sebagai PDF" untuk arsip rapat bulanan.',
      createdAt: '2026-09-30T10:15:00Z',
    },
  ],
  'dir-1': [
    {
      id: 'mc-dir-1-1',
      stepId: 'dir-1',
      authorName: 'Coach Zamoa',
      authorRole: 'OWNER_DIRECTOR',
      authorTitle: 'Founder & Direktur Utama',
      isMentorTip: true,
      content:
        'Tips Senior: Pantau rasio Laba/Rugi per cabang setiap tanggal 20. Jika margin cabang di bawah 15%, prioritaskan efisiensi operasional sebelum menambah pengeluaran baru.',
      createdAt: '2026-09-29T14:20:00Z',
    },
  ],
  'bm-1': [
    {
      id: 'mc-bm-1-1',
      stepId: 'bm-1',
      authorName: 'Budi Hartono',
      authorRole: 'OPERATIONS_MANAGER',
      authorTitle: 'Senior Operations Manager',
      isMentorTip: true,
      content:
        'Tips Mentor: Validasi kehadiran pelatih pada sesi latihan pagi maksimal pukul 09.00 WIB. Bila ada pelatih pengganti (substitute), segera ubah di sesi latihan agar payroll akurat.',
      createdAt: '2026-09-29T07:45:00Z',
    },
  ],
  'admin-1': [
    {
      id: 'mc-admin-1-1',
      stepId: 'admin-1',
      authorName: 'Rina Kusuma',
      authorRole: 'ADMIN',
      authorTitle: 'Senior Academy Registrar',
      isMentorTip: true,
      content:
        'Tips Mentor: Verifikasi dokumen scan akta kelahiran & NISN calon atlet sebelum menetapkan Kelompok Umur (KU) resmi agar terhindar dari sanksi diskualifikasi kejuaraan Perbasi.',
      createdAt: '2026-09-30T09:00:00Z',
    },
    {
      id: 'mc-admin-1-2',
      stepId: 'admin-1',
      authorName: 'Sekretariat Utama',
      authorRole: 'ADMIN',
      authorTitle: 'Staf Administrasi',
      isMentorTip: false,
      content:
        'Catatan Lapangan: Pastikan nomor WhatsApp orang tua diawali format internasional (+62/08) agar notifikasi otomatis invoice dan evaluasi berhasil terkirim.',
      createdAt: '2026-10-01T08:10:00Z',
    },
  ],
  'admin-2': [
    {
      id: 'mc-admin-2-1',
      stepId: 'admin-2',
      authorName: 'Rina Kusuma',
      authorRole: 'ADMIN',
      authorTitle: 'Senior Academy Registrar',
      isMentorTip: true,
      content:
        'Tips Mentor: Saat memindahkan atlet antar tim atau menaikkan ke KU lebih tinggi, pastikan pelatih kepala tim asal dan tim baru sudah memberikan rekomendasi tertulis.',
      createdAt: '2026-09-27T11:00:00Z',
    },
  ],
  'fin-1': [
    {
      id: 'mc-fin-1-1',
      stepId: 'fin-1',
      authorName: 'Hendra Wijaya, S.E., Ak.',
      authorRole: 'FINANCE',
      authorTitle: 'Senior Finance & Tax Officer',
      isMentorTip: true,
      content:
        'Tips Mentor: Terbitkan invoice membership massal setiap tanggal 25 dengan jatuh tempo tanggal 5 bulan berikutnya. Ini memberi rentang pembayaran yang sangat ideal bagi orang tua.',
      createdAt: '2026-09-25T16:00:00Z',
    },
  ],
  'fin-2': [
    {
      id: 'mc-fin-2-1',
      stepId: 'fin-2',
      authorName: 'Hendra Wijaya, S.E., Ak.',
      authorRole: 'FINANCE',
      authorTitle: 'Senior Finance & Tax Officer',
      isMentorTip: false,
      content:
        'Catatan Operasional: Sebelum klik "Posting ke Buku Besar", pastikan bukti transfer bank sudah sesuai dengan nominal invoice dan tanggal mutasi rekening koran.',
      createdAt: '2026-09-26T13:30:00Z',
    },
  ],
  'coach-1': [
    {
      id: 'mc-coach-1-1',
      stepId: 'coach-1',
      authorName: 'Coach Aris Pratama',
      authorRole: 'HEAD_COACH',
      authorTitle: 'Direktur Teknik Kepelatihan',
      isMentorTip: true,
      content:
        'Tips Mentor: Gunakan pemindai QR atau input presensi sebelum drill pemanasan selesai. Periksa kondisi atlet yang tampak lesu atau cedera sebelum memasukkannya ke latihan intensitas tinggi.',
      createdAt: '2026-09-28T15:00:00Z',
    },
  ],
  'coach-2': [
    {
      id: 'mc-coach-2-1',
      stepId: 'coach-2',
      authorName: 'Coach Aris Pratama',
      authorRole: 'HEAD_COACH',
      authorTitle: 'Direktur Teknik Kepelatihan',
      isMentorTip: true,
      content:
        'Tips Mentor: Rapor evaluasi jangan hanya berisi angka. Berikan minimal 1 kalimat penyemangat dan 1 aspek teknik prioritas yang harus diperbaiki atlet pada bulan berikutnya.',
      createdAt: '2026-09-29T18:00:00Z',
    },
  ],
  'med-1': [
    {
      id: 'mc-med-1-1',
      stepId: 'med-1',
      authorName: 'dr. Andika, Sp.KO',
      authorRole: 'MEDICAL_STAFF',
      authorTitle: 'Dokter Tim & Fisioterapis',
      isMentorTip: true,
      content:
        'Tips Mentor: Begitu ada insiden cedera, langsung aktifkan status RTP "OUT" pada sistem dalam 15 menit agar pelatih kepala segera melihat peringatan merah di dashboard sebelum game lanjut.',
      createdAt: '2026-09-28T09:30:00Z',
    },
  ],
};

export interface DocumentationGuideProps {
  activeRoleCode: string;
  currentUser?: SystemState['currentUser'];
  users?: SystemState['users'];
  branches?: SystemState['branches'];
  organizationName?: string;
  onNavigateToModule: (nav: NavSection) => void;
  onSwitchRole: (roleCode: string) => void;
  onLoginAsUser?: (user: SystemState['users'][number]) => void;
  onClose?: () => void;
  notify?: (message: string, type?: 'success' | 'error') => void;
}

export function DocumentationGuide({
  activeRoleCode,
  currentUser,
  users = [],
  branches = [],
  organizationName = 'ZAMOA CBTC Basketball Academy',
  onNavigateToModule,
  onSwitchRole,
  onLoginAsUser,
  onClose,
  notify,
}: DocumentationGuideProps) {
  const normalizedActiveRole = normalizeRoleCode(activeRoleCode);
  const [selectedRole, setSelectedRole] = useState<RoleCode>(normalizedActiveRole);
  const [activeGuideTab, setActiveGuideTab] = useState<'workflow' | 'permissions' | 'kpis'>('workflow');
  const [roleSearch, setRoleSearch] = useState('');
  const [completedSteps, setCompletedSteps] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('zamoa_cbtc_onboarding_progress_v1');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Step Comments & Mentor Notes state
  const [mentorComments, setMentorComments] = useState<Record<string, StepMentorComment[]>>(() => {
    try {
      const saved = localStorage.getItem('zamoa_cbtc_step_mentor_comments_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...DEFAULT_STEP_MENTOR_COMMENTS, ...parsed };
      }
    } catch {
      // ignore
    }
    return DEFAULT_STEP_MENTOR_COMMENTS;
  });

  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({});
  const [commentDrafts, setCommentDrafts] = useState<
    Record<
      string,
      {
        authorName: string;
        authorRole: string;
        isMentorTip: boolean;
        content: string;
      }
    >
  >({});

  const toggleStepComments = (stepId: string) => {
    setExpandedComments((prev) => ({
      ...prev,
      [stepId]: !prev[stepId],
    }));
  };

  const handleDraftChange = (
    stepId: string,
    field: 'authorName' | 'authorRole' | 'isMentorTip' | 'content',
    value: string | boolean
  ) => {
    setCommentDrafts((prev) => {
      const current = prev[stepId] || {
        authorName: currentUser?.fullName || 'Senior Mentor',
        authorRole: currentUser?.activeRoleCode || selectedRole,
        isMentorTip: true,
        content: '',
      };
      return {
        ...prev,
        [stepId]: {
          ...current,
          [field]: value,
        },
      };
    });
  };

  const handleAddComment = (stepId: string) => {
    const draft = commentDrafts[stepId] || {
      authorName: currentUser?.fullName || 'Senior Mentor',
      authorRole: currentUser?.activeRoleCode || selectedRole,
      isMentorTip: true,
      content: '',
    };

    if (!draft.content.trim()) {
      if (notify) notify('Silakan tulis isi catatan atau tips mentor terlebih dahulu.', 'error');
      return;
    }

    const newComment: StepMentorComment = {
      id: `comment-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      stepId,
      authorName: draft.authorName.trim() || currentUser?.fullName || 'Senior Mentor',
      authorRole: draft.authorRole.trim() || currentUser?.activeRoleCode || selectedRole,
      authorTitle: currentUser?.jobTitle || undefined,
      isMentorTip: Boolean(draft.isMentorTip),
      content: draft.content.trim(),
      createdAt: new Date().toISOString(),
    };

    setMentorComments((prev) => {
      const existing = prev[stepId] || [];
      const updated = [newComment, ...existing];
      const next = { ...prev, [stepId]: updated };
      try {
        localStorage.setItem('zamoa_cbtc_step_mentor_comments_v1', JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });

    // Reset content in draft
    setCommentDrafts((prev) => ({
      ...prev,
      [stepId]: {
        ...draft,
        content: '',
      },
    }));

    if (notify) {
      notify('Catatan mentor/senior berhasil disimpan untuk langkah ini.', 'success');
    }
  };

  const handleDeleteComment = (stepId: string, commentId: string) => {
    setMentorComments((prev) => {
      const existing = prev[stepId] || [];
      const updated = existing.filter((c) => c.id !== commentId);
      const next = { ...prev, [stepId]: updated };
      try {
        localStorage.setItem('zamoa_cbtc_step_mentor_comments_v1', JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });

    if (notify) {
      notify('Catatan berhasil dihapus.', 'success');
    }
  };

  useEffect(() => {
    setSelectedRole(normalizeRoleCode(activeRoleCode));
  }, [activeRoleCode]);

  const toggleStepCompleted = (stepId: string) => {
    setCompletedSteps((prev) => {
      const next = { ...prev, [stepId]: !prev[stepId] };
      try {
        localStorage.setItem('zamoa_cbtc_onboarding_progress_v1', JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

  const resetRoleProgress = (role: RoleCode) => {
    const playbook = ROLE_DOCUMENTATION_PLAYBOOKS[role];
    if (!playbook) return;
    setCompletedSteps((prev) => {
      const next = { ...prev };
      playbook.steps.forEach((s) => {
        delete next[s.id];
      });
      try {
        localStorage.setItem('zamoa_cbtc_onboarding_progress_v1', JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const filteredRoles = SYSTEM_ROLES.filter((r) => {
    if (!roleSearch.trim()) return true;
    const q = roleSearch.toLowerCase();
    const pb = ROLE_DOCUMENTATION_PLAYBOOKS[r.code];
    return (
      r.code.toLowerCase().includes(q) ||
      r.name.toLowerCase().includes(q) ||
      r.description.toLowerCase().includes(q) ||
      pb?.headline.toLowerCase().includes(q) ||
      pb?.steps.some(
        (s) => s.title.toLowerCase().includes(q) || s.instruction.toLowerCase().includes(q)
      )
    );
  });

  const currentRoleDef =
    SYSTEM_ROLES.find((r) => r.code === selectedRole) || SYSTEM_ROLES[0];
  const currentPlaybook =
    ROLE_DOCUMENTATION_PLAYBOOKS[selectedRole] || ROLE_DOCUMENTATION_PLAYBOOKS.SUPER_ADMIN;

  const completedCountForRole = currentPlaybook.steps.filter((s) => completedSteps[s.id]).length;
  const totalStepsForRole = currentPlaybook.steps.length;
  const completionPct =
    totalStepsForRole > 0 ? Math.round((completedCountForRole / totalStepsForRole) * 100) : 0;

  const matchingDatabaseUsers = users.filter(
    (u) => normalizeRoleCode(u.activeRoleCode) === selectedRole
  );

  const [exportingPdf, setExportingPdf] = useState(false);

  const renderRoleSectionToPdf = (
    doc: jsPDF,
    roleCodeToRender: RoleCode,
    isFirstRolePage: boolean
  ) => {
    if (!isFirstRolePage) {
      doc.addPage();
    }

    const roleDef =
      SYSTEM_ROLES.find((r) => r.code === roleCodeToRender) || SYSTEM_ROLES[0];
    const playbook =
      ROLE_DOCUMENTATION_PLAYBOOKS[roleCodeToRender] || ROLE_DOCUMENTATION_PLAYBOOKS.SUPER_ADMIN;
    const roleDoneCount = playbook.steps.filter((s) => completedSteps[s.id]).length;
    const roleTotalCount = playbook.steps.length;
    const rolePct =
      roleTotalCount > 0 ? Math.round((roleDoneCount / roleTotalCount) * 100) : 0;

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;
    const contentWidth = pageWidth - margin * 2;
    let y = 14;

    const ensureSpace = (neededHeight: number) => {
      if (y + neededHeight > pageHeight - 18) {
        doc.addPage();
        // Top mini header on continuation page
        doc.setFillColor(15, 23, 42);
        doc.rect(0, 0, pageWidth, 12, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(245, 158, 11);
        doc.text(
          `${organizationName.toUpperCase()} — SOP PLAYBOOK ROLE: ${roleDef.code} (LANJUTAN)`,
          margin,
          8
        );
        y = 18;
      }
    };

    // 1. Executive Header Banner
    doc.setFillColor(9, 13, 22);
    doc.rect(0, 0, pageWidth, 34, 'F');
    doc.setFillColor(245, 158, 11);
    doc.rect(0, 33, pageWidth, 1.5, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(245, 158, 11);
    doc.text(
      `${organizationName.toUpperCase()} • ENTERPRISE ACADEMY MANAGEMENT SYSTEM`,
      margin,
      10
    );

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(248, 250, 252);
    doc.text(`PANDUAN OPERASIONAL & SOP ROLE: ${roleDef.name.toUpperCase()}`, margin, 19);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(203, 213, 225);
    const docDateStr = new Date().toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
    doc.text(
      `Kode Role: ${roleDef.code}  |  Departemen: ${playbook.department}  |  Dicetak: ${docDateStr}`,
      margin,
      27
    );

    y = 41;

    // 2. Role Summary Box
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    const summaryLines = doc.splitTextToSize(playbook.operationalSummary, contentWidth - 8);
    const headlineLines = doc.splitTextToSize(playbook.headline, contentWidth - 8);
    const summaryBoxHeight = 16 + headlineLines.length * 4.5 + summaryLines.length * 4.2;
    doc.roundedRect(margin, y, contentWidth, summaryBoxHeight, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text(headlineLines, margin + 4, y + 6);

    const summaryStartY = y + 6 + headlineLines.length * 4.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(51, 65, 85);
    doc.text(summaryLines, margin + 4, summaryStartY);

    const metaRowY = summaryStartY + summaryLines.length * 4.2 + 2;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(180, 83, 9);
    const scopeLabel = roleDef.branchScoped
      ? 'Cakupan Data: Terikat Filter Cabang Aktif'
      : 'Cakupan Data: Otorisasi Lintas Cabang (Konsolidasi Pusat)';
    doc.text(
      `${scopeLabel}   •   Progres Onboarding Staf: ${roleDoneCount}/${roleTotalCount} Tahap (${rolePct}%)`,
      margin + 4,
      metaRowY
    );

    y += summaryBoxHeight + 7;

    // 3. Section: Alur Kerja Operasional Langkah demi Langkah
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);
    doc.text(
      `I. ALUR KERJA OPERASIONAL & PROSEDUR STANDAR (${playbook.steps.length} TAHAP UTAMA)`,
      margin,
      y
    );
    y += 2;
    doc.setDrawColor(245, 158, 11);
    doc.setLineWidth(0.6);
    doc.line(margin, y, margin + 85, y);
    doc.setLineWidth(0.2);
    y += 5;

    playbook.steps.forEach((step) => {
      const isDone = Boolean(completedSteps[step.id]);
      const instLines = doc.splitTextToSize(
        `Instruksi Kerja: ${step.instruction}`,
        contentWidth - 8
      );
      const outLines = doc.splitTextToSize(
        `Output Sistem: ${step.expectedOutput}`,
        contentWidth - 8
      );
      const commentsForStep = mentorComments[step.id] || [];
      const mentorNotesText = commentsForStep.length > 0
        ? `Catatan/Tips Mentor: ${commentsForStep
            .map((c) => `[${c.authorName} (${c.authorRole})]: ${c.content}`)
            .join(' | ')}`
        : '';
      const mentorNotesLines = mentorNotesText
        ? doc.splitTextToSize(mentorNotesText, contentWidth - 8)
        : [];

      const boxHeight =
        15 +
        instLines.length * 4.1 +
        outLines.length * 4.1 +
        (mentorNotesLines.length > 0 ? mentorNotesLines.length * 3.7 + 3.5 : 0);

      ensureSpace(boxHeight + 4);

      doc.setFillColor(isDone ? 240 : 255, isDone ? 253 : 255, isDone ? 244 : 255);
      doc.setDrawColor(isDone ? 16 : 203, isDone ? 185 : 213, isDone ? 129 : 225);
      doc.roundedRect(margin, y, contentWidth, boxHeight, 1.5, 1.5, 'FD');

      // Step badge & title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(180, 83, 9);
      const statusText = isDone ? '[SELESAI DIPELAJARI]' : '[WAJIB DIPELAJARI]';
      doc.text(
        `LANGKAH ${step.stepNumber} • ${step.frequency} • MODUL: ${step.targetModuleLabel.toUpperCase()} • ${statusText}`,
        margin + 4,
        y + 5.5
      );

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(15, 23, 42);
      doc.text(step.title, margin + 4, y + 10.5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(51, 65, 85);
      const instY = y + 15;
      doc.text(instLines, margin + 4, instY);

      const outY = instY + instLines.length * 4.1 + 1;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(15, 118, 110);
      doc.text(outLines, margin + 4, outY);

      if (mentorNotesLines.length > 0) {
        const notesY = outY + outLines.length * 4.1 + 2;
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(7.5);
        doc.setTextColor(180, 83, 9);
        doc.text(mentorNotesLines, margin + 4, notesY);
      }

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text(
        `Izin RBAC: ${step.domain}:${step.requiredAction}`,
        pageWidth - margin - 4,
        y + 5.5,
        { align: 'right' }
      );

      y += boxHeight + 3.5;
    });

    y += 3;

    // 4. Section: KPI Utama & Panduan Praktik Terbaik (Side-by-Side or Sequential)
    ensureSpace(46);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);
    doc.text('II. INDIKATOR KINERJA UTAMA (KPI) & PRAKTIK TERBAIK (BEST PRACTICES)', margin, y);
    y += 2;
    doc.setDrawColor(245, 158, 11);
    doc.setLineWidth(0.6);
    doc.line(margin, y, margin + 95, y);
    doc.setLineWidth(0.2);
    y += 5;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text('Target KPI Utama Role Ini:', margin, y);
    y += 4.5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(51, 65, 85);
    playbook.primaryKpis.forEach((kpi, idx) => {
      const kpiLines = doc.splitTextToSize(`0${idx + 1}. ${kpi}`, contentWidth - 4);
      ensureSpace(kpiLines.length * 4.2 + 2);
      doc.text(kpiLines, margin + 2, y);
      y += kpiLines.length * 4.2 + 1;
    });

    y += 2.5;
    ensureSpace(20);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text('Standar Kepatuhan & Praktik Terbaik (Best Practices):', margin, y);
    y += 4.5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(51, 65, 85);
    playbook.bestPractices.forEach((bp) => {
      const bpLines = doc.splitTextToSize(`• ${bp}`, contentWidth - 4);
      ensureSpace(bpLines.length * 4.2 + 2);
      doc.text(bpLines, margin + 2, y);
      y += bpLines.length * 4.2 + 1;
    });

    y += 4;

    // 5. Section: Matriks Hak Akses Domain RBAC
    ensureSpace(45);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);
    doc.text(`III. MATRIKS OTORISASI HAK AKSES (20 DOMAIN SISTEM — ${roleDef.code})`, margin, y);
    y += 2;
    doc.setDrawColor(245, 158, 11);
    doc.setLineWidth(0.6);
    doc.line(margin, y, margin + 95, y);
    doc.setLineWidth(0.2);
    y += 5;

    const colWidth = (contentWidth - 4) / 2;
    for (let i = 0; i < ALL_DOMAINS_LIST.length; i += 2) {
      ensureSpace(11);
      [0, 1].forEach((offset) => {
        const dom = ALL_DOMAINS_LIST[i + offset];
        if (!dom) return;
        const xPos = margin + offset * (colWidth + 4);
        const actions: PermissionAction[] =
          roleCodeToRender === 'SUPER_ADMIN'
            ? [
                'view',
                'create',
                'update',
                'delete',
                'approve',
                'export',
                'manage',
                'process',
                'audit',
              ]
            : ROLE_PERMISSION_MATRIX[roleCodeToRender]?.[dom.code] || [];
        const hasAccess = actions.length > 0;

        doc.setFillColor(hasAccess ? 248 : 241, hasAccess ? 250 : 245, hasAccess ? 252 : 249);
        doc.setDrawColor(203, 213, 225);
        doc.roundedRect(xPos, y, colWidth, 9.5, 1, 1, 'FD');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(hasAccess ? 15 : 100, hasAccess ? 23 : 116, hasAccess ? 42 : 139);
        doc.text(dom.label, xPos + 2.5, y + 4);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.8);
        doc.setTextColor(hasAccess ? 15 : 148, hasAccess ? 118 : 163, hasAccess ? 110 : 184);
        const actStr = hasAccess ? `Diizinkan: ${actions.join(', ')}` : 'Dibatasi (Tanpa Akses)';
        doc.text(actStr, xPos + 2.5, y + 7.8);
      });
      y += 11;
    }
  };

  const addPdfFooters = (doc: jsPDF, docLabel: string) => {
    const totalPages = doc.getNumberOfPages();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setDrawColor(203, 213, 225);
      doc.line(14, pageHeight - 12, pageWidth - 14, pageHeight - 12);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text(
        `${organizationName} • Dokumen Resmi Onboarding & SOP RBAC (${docLabel})`,
        14,
        pageHeight - 7.5
      );
      doc.text(
        `Halaman ${p} dari ${totalPages}`,
        pageWidth - 14,
        pageHeight - 7.5,
        { align: 'right' }
      );
    }
  };

  const handleDownloadRolePdf = (roleToExport: RoleCode = selectedRole) => {
    try {
      setExportingPdf(true);
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      renderRoleSectionToPdf(doc, roleToExport, true);
      addPdfFooters(doc, `Role ${roleToExport}`);

      const dateSlug = new Date().toISOString().slice(0, 10);
      const fileName = `Panduan-SOP-RBAC-ZAMOA-CBTC-${roleToExport}-${dateSlug}.pdf`;
      doc.save(fileName);

      if (notify) {
        notify(`Panduan PDF untuk role ${roleToExport} berhasil diunduh (${fileName}).`);
      }
    } catch (err: unknown) {
      if (notify) {
        notify(
          err instanceof Error ? err.message : 'Gagal mengekspor dokumen panduan PDF.',
          'error'
        );
      }
    } finally {
      setExportingPdf(false);
    }
  };

  const handleDownloadAllRolesPdf = () => {
    try {
      setExportingPdf(true);
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      SYSTEM_ROLES.forEach((role, index) => {
        renderRoleSectionToPdf(doc, role.code, index === 0);
      });
      addPdfFooters(doc, 'Bundel Lengkap 12 Role RBAC');

      const dateSlug = new Date().toISOString().slice(0, 10);
      const fileName = `Buku-Induk-SOP-12-Role-RBAC-ZAMOA-CBTC-${dateSlug}.pdf`;
      doc.save(fileName);

      if (notify) {
        notify(`Bundel PDF lengkap seluruh 12 role RBAC berhasil diunduh (${fileName}).`);
      }
    } catch (err: unknown) {
      if (notify) {
        notify(
          err instanceof Error ? err.message : 'Gagal mengekspor bundel PDF.',
          'error'
        );
      }
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="space-y-5 max-h-[80vh] overflow-y-auto pr-1">
      {/* Top Onboarding Banner */}
      <div className="p-4 rounded-lg border border-amber-500/30 bg-gradient-to-r from-amber-950/25 via-slate-900/90 to-slate-950 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-[10px] font-mono font-bold text-amber-300 uppercase tracking-wider">
              <Sparkles className="w-3 h-3" />
              INTERACTIVE RBAC PLAYBOOK & ONBOARDING
            </span>
            <span className="text-[11px] font-mono text-slate-400">
              12 Role Standar • 20 Domain Otorisasi • Navigasi Langsung
            </span>
          </div>
          <h3 className="text-sm font-bold text-slate-100">
            Panduan Operasional Interaktif Berbasis Role (Role-Based Access Control)
          </h3>
          <p className="text-xs text-slate-300 leading-relaxed">
            Pilih role di panel kiri untuk mempelajari alur kerja harian, matriks izin akses modul, serta daftar KPI utama. Tandai langkah yang sudah Anda kuasai atau klik{' '}
            <span className="text-amber-300 font-semibold">&ldquo;Buka Modul &amp; Praktikkan&rdquo;</span>{' '}
            untuk langsung mengeksekusi fitur terkait.
          </p>
        </div>

        <div className="shrink-0 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={exportingPdf}
            onClick={() => handleDownloadRolePdf(selectedRole)}
            className="px-3.5 py-2 text-xs font-bold bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 rounded-md flex items-center gap-1.5 shadow-sm transition-colors"
            title={`Unduh Playbook SOP Role ${selectedRole} sebagai dokumen PDF siap cetak`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>
              {exportingPdf
                ? 'Menyiapkan PDF...'
                : `Unduh Panduan sebagai PDF (${selectedRole})`}
            </span>
          </button>

          <button
            type="button"
            disabled={exportingPdf}
            onClick={handleDownloadAllRolesPdf}
            className="px-3 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-amber-300 border border-amber-500/40 rounded-md flex items-center gap-1.5 transition-colors"
            title="Unduh Buku Induk SOP seluruh 12 Role RBAC dalam satu file PDF"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Unduh Bundel 12 Role (PDF)</span>
          </button>

          {selectedRole !== normalizedActiveRole ? (
            <button
              type="button"
              onClick={() => onSwitchRole(selectedRole)}
              className="px-3.5 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-md flex items-center gap-1.5 shadow-sm transition-colors"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Simulasikan Role {selectedRole} Sekarang</span>
            </button>
          ) : (
            <span className="px-3 py-1.5 text-xs font-mono font-bold bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 rounded-md flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Role Anda Saat Ini ({selectedRole})</span>
            </span>
          )}
        </div>
      </div>

      {/* Main Split Grid: Left Role Directory | Right Interactive Playbook */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* LEFT COLUMN: ROLE SELECTOR */}
        <div className="lg:col-span-4 space-y-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={roleSearch}
              onChange={(e) => setRoleSearch(e.target.value)}
              placeholder="Cari role, tugas, atau alur kerja..."
              className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500/60 rounded-md pl-8 pr-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none"
            />
          </div>

          <div className="space-y-1.5 max-h-[54vh] overflow-y-auto pr-1">
            {filteredRoles.map((role) => {
              const isSelected = role.code === selectedRole;
              const isCurrentActive = role.code === normalizedActiveRole;
              const pb = ROLE_DOCUMENTATION_PLAYBOOKS[role.code];
              const doneSteps = pb ? pb.steps.filter((s) => completedSteps[s.id]).length : 0;
              const totalSteps = pb ? pb.steps.length : 0;

              return (
                <button
                  key={role.code}
                  type="button"
                  onClick={() => setSelectedRole(role.code)}
                  className={`w-full text-left p-2.5 rounded-md border transition-all flex flex-col gap-1.5 ${
                    isSelected
                      ? 'bg-amber-500/15 border-amber-500/60 text-slate-100 shadow-sm'
                      : 'bg-slate-950/70 border-slate-800/90 hover:border-slate-700 text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className={`text-xs font-bold truncate ${
                          isSelected ? 'text-amber-300' : 'text-slate-100'
                        }`}
                      >
                        {role.name}
                      </span>
                      {isCurrentActive && (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-500 text-slate-950 font-bold shrink-0">
                          AKTIF
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 shrink-0">
                      {doneSteps}/{totalSteps} SOP
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[10px] font-mono">
                    <span className="text-amber-400/90">{role.code}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded border ${
                        role.branchScoped
                          ? 'border-sky-500/30 bg-sky-950/30 text-sky-300'
                          : 'border-purple-500/30 bg-purple-950/30 text-purple-300'
                      }`}
                    >
                      {role.branchScoped ? 'Cakupan Cabang' : 'Lintas Cabang (Pusat)'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 line-clamp-2 leading-snug">
                    {role.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* RIGHT COLUMN: SELECTED ROLE PLAYBOOK DETAILS */}
        <div className="lg:col-span-8 space-y-4">
          {/* Role Header Card */}
          <div className="p-4 rounded-lg border border-slate-800 bg-slate-950/90 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-amber-500 text-slate-950">
                    {currentRoleDef.code}
                  </span>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded border border-slate-700 bg-slate-900 text-slate-300">
                    {currentPlaybook.department}
                  </span>
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                      currentRoleDef.branchScoped
                        ? 'border-sky-500/40 bg-sky-950/30 text-sky-300'
                        : 'border-purple-500/40 bg-purple-950/30 text-purple-300'
                    }`}
                  >
                    {currentRoleDef.branchScoped
                      ? 'Terikat Filter Cabang Aktif'
                      : 'Otorisasi Konsolidasi Semua Cabang'}
                  </span>
                </div>
                <h4 className="text-base font-bold text-slate-100 font-display pt-0.5">
                  {currentRoleDef.name} — {currentPlaybook.headline}
                </h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {currentPlaybook.operationalSummary}
                </p>
              </div>

              <div className="shrink-0 flex items-center gap-2">
                <button
                  type="button"
                  disabled={exportingPdf}
                  onClick={() => handleDownloadRolePdf(selectedRole)}
                  className="px-3 py-1.5 text-xs font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 rounded flex items-center gap-1.5 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Unduh Panduan sebagai PDF</span>
                </button>
              </div>
            </div>

            {/* Onboarding Progress Bar for Selected Role */}
            <div className="pt-2 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex-1 space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400 font-medium">
                    Progres Penguasaan Alur Kerja ({currentRoleDef.name})
                  </span>
                  <span className="font-mono font-bold text-emerald-400">
                    {completedCountForRole} dari {totalStepsForRole} Langkah Selesai ({completionPct}%)
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-900 overflow-hidden border border-slate-800">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500 to-emerald-400 transition-all duration-300"
                    style={{ width: `${completionPct}%` }}
                  />
                </div>
              </div>
              {completedCountForRole > 0 && (
                <button
                  type="button"
                  onClick={() => resetRoleProgress(selectedRole)}
                  className="px-2.5 py-1 text-[11px] font-mono text-slate-400 hover:text-slate-200 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded flex items-center gap-1 shrink-0"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset Checklist</span>
                </button>
              )}
            </div>

            {/* Sub-Navigation Tabs inside Playbook */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setActiveGuideTab('workflow')}
                className={`px-3 py-1.5 text-xs font-semibold rounded border transition-colors flex items-center gap-1.5 ${
                  activeGuideTab === 'workflow'
                    ? 'bg-amber-500 text-slate-950 border-amber-400'
                    : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>1. Alur Kerja Operasional ({currentPlaybook.steps.length} Tahap)</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveGuideTab('permissions')}
                className={`px-3 py-1.5 text-xs font-semibold rounded border transition-colors flex items-center gap-1.5 ${
                  activeGuideTab === 'permissions'
                    ? 'bg-amber-500 text-slate-950 border-amber-400'
                    : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>2. Matriks Hak Akses RBAC (20 Domain)</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveGuideTab('kpis')}
                className={`px-3 py-1.5 text-xs font-semibold rounded border transition-colors flex items-center gap-1.5 ${
                  activeGuideTab === 'kpis'
                    ? 'bg-amber-500 text-slate-950 border-amber-400'
                    : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                }`}
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>
                  3. KPI, Praktik Terbaik &amp; Akun Personel ({matchingDatabaseUsers.length})
                </span>
              </button>
            </div>
          </div>

          {/* TAB 1: STEP-BY-STEP OPERATIONAL WORKFLOW */}
          {activeGuideTab === 'workflow' && (
            <div className="space-y-3">
              {currentPlaybook.steps.map((step) => {
                const isDone = Boolean(completedSteps[step.id]);
                const permittedForCurrentRole = hasPermission(
                  activeRoleCode,
                  step.domain,
                  step.requiredAction
                );

                return (
                  <div
                    key={step.id}
                    className={`p-4 rounded-lg border transition-colors space-y-3 ${
                      isDone
                        ? 'border-emerald-500/40 bg-emerald-950/10'
                        : 'border-slate-800 bg-slate-950/80 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-start gap-2.5">
                        <button
                          type="button"
                          onClick={() => toggleStepCompleted(step.id)}
                          className="mt-0.5 text-slate-400 hover:text-emerald-400 transition-colors shrink-0"
                          title={
                            isDone ? 'Tandai belum selesai' : 'Tandai langkah ini sudah dipelajari'
                          }
                        >
                          {isDone ? (
                            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                          ) : (
                            <Circle className="w-5 h-5 text-slate-500" />
                          )}
                        </button>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-amber-400">
                              LANGKAH {step.stepNumber}
                            </span>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500/15 border border-sky-500/30 text-sky-300">
                              {step.frequency}
                            </span>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300">
                              Modul: {step.targetModuleLabel}
                            </span>
                          </div>
                          <h5
                            className={`text-sm font-bold mt-1 ${
                              isDone ? 'line-through text-slate-400' : 'text-slate-100'
                            }`}
                          >
                            {step.title}
                          </h5>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 pl-7 sm:pl-0">
                        <button
                          type="button"
                          onClick={() => toggleStepCompleted(step.id)}
                          className={`px-2.5 py-1.5 text-[11px] font-semibold rounded border transition-colors ${
                            isDone
                              ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                              : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-300'
                          }`}
                        >
                          {isDone ? 'Sudah Dipelajari' : 'Tandai Paham'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (selectedRole !== normalizedActiveRole && !permittedForCurrentRole) {
                              onSwitchRole(selectedRole);
                            }
                            onNavigateToModule(step.targetNav);
                            if (onClose) onClose();
                          }}
                          className="px-3 py-1.5 text-[11px] font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded flex items-center gap-1 transition-colors"
                        >
                          <span>Buka Modul &amp; Praktikkan</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    <div className="pl-7 space-y-2">
                      <p className="text-xs text-slate-300 leading-relaxed">{step.instruction}</p>
                      <div className="p-2.5 rounded bg-slate-900/80 border border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px]">
                        <div>
                          <span className="font-mono text-emerald-400 font-semibold">
                            Output Sistem:{' '}
                          </span>
                          <span className="text-slate-300">{step.expectedOutput}</span>
                        </div>
                        <span className="font-mono text-[10px] text-slate-400 shrink-0">
                          Izin RBAC: {step.domain}:{step.requiredAction}
                        </span>
                      </div>

                      {/* KOLOM KOMENTAR & CATATAN MENTOR / SENIOR */}
                      <div className="mt-3 pt-3 border-t border-slate-800/80">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => toggleStepComments(step.id)}
                            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-300 hover:text-amber-300 transition-colors group"
                          >
                            <div className="flex items-center gap-1.5">
                              <MessageSquare className="w-3.5 h-3.5 text-amber-400 group-hover:scale-110 transition-transform" />
                              <span>Catatan &amp; Tips Mentor</span>
                              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-slate-900 border border-slate-700 text-amber-300">
                                {(mentorComments[step.id] || []).length}
                              </span>
                            </div>

                            {(mentorComments[step.id] || []).some((c) => c.isMentorTip) && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                <Lightbulb className="w-3 h-3 text-amber-400" />
                                Tips Senior
                              </span>
                            )}

                            {expandedComments[step.id] ? (
                              <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              if (!expandedComments[step.id]) {
                                toggleStepComments(step.id);
                              }
                            }}
                            className="text-[11px] text-amber-400/90 hover:text-amber-300 font-medium flex items-center gap-1"
                          >
                            <span>+ Tulis Catatan / Tips Baru</span>
                          </button>
                        </div>

                        {/* Expanded Comments Drawer */}
                        {expandedComments[step.id] && (
                          <div className="mt-3 space-y-3 bg-slate-950/90 rounded-lg p-3.5 border border-slate-800">
                            <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                              <div className="flex items-center gap-1.5">
                                <MessageSquare className="w-3.5 h-3.5 text-amber-400" />
                                <span className="text-xs font-bold text-slate-200">
                                  Kolom Catatan Mentor &amp; Tips Operasional ({step.title})
                                </span>
                              </div>
                              <span className="text-[10px] font-mono text-slate-400">
                                {(mentorComments[step.id] || []).length} Catatan Tersimpan
                              </span>
                            </div>

                            {/* Existing Comments List */}
                            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                              {(!mentorComments[step.id] || mentorComments[step.id].length === 0) ? (
                                <div className="p-3 rounded border border-dashed border-slate-800 bg-slate-900/40 text-center text-xs text-slate-400">
                                  Belum ada catatan mentor atau tips khusus untuk langkah ini. Silakan tuliskan tips di bawah untuk membantu staf baru!
                                </div>
                              ) : (
                                mentorComments[step.id].map((comment) => (
                                  <div
                                    key={comment.id}
                                    className={`p-2.5 rounded-md border text-xs space-y-1.5 ${
                                      comment.isMentorTip
                                        ? 'bg-amber-950/20 border-amber-500/30 text-slate-200'
                                        : 'bg-slate-900/80 border-slate-800 text-slate-300'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        {comment.isMentorTip ? (
                                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-500/20 border border-amber-500/40 text-amber-300">
                                            <Lightbulb className="w-2.5 h-2.5 text-amber-400" />
                                            TIPS MENTOR
                                          </span>
                                        ) : (
                                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-sky-500/20 border border-sky-500/40 text-sky-300">
                                            CATATAN STAF
                                          </span>
                                        )}
                                        <span className="font-semibold text-slate-100">
                                          {comment.authorName}
                                        </span>
                                        <span className="text-[10px] font-mono text-amber-400/90 px-1 rounded bg-slate-900 border border-slate-800">
                                          {comment.authorRole}
                                        </span>
                                        {comment.authorTitle && (
                                          <span className="text-[10px] text-slate-400">
                                            • {comment.authorTitle}
                                          </span>
                                        )}
                                      </div>

                                      <div className="flex items-center gap-2 shrink-0">
                                        <span className="text-[10px] font-mono text-slate-500">
                                          {new Date(comment.createdAt).toLocaleDateString('id-ID', {
                                            day: '2-digit',
                                            month: 'short',
                                            year: 'numeric',
                                            hour: '2-digit',
                                            minute: '2-digit',
                                          })}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => handleDeleteComment(step.id, comment.id)}
                                          className="text-slate-500 hover:text-red-400 p-1 rounded transition-colors"
                                          title="Hapus catatan ini"
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                      </div>
                                    </div>

                                    <p className="text-xs text-slate-200 leading-relaxed pl-1 whitespace-pre-line">
                                      {comment.content}
                                    </p>
                                  </div>
                                ))
                              )}
                            </div>

                            {/* Form Input New Comment */}
                            <div className="pt-2 border-t border-slate-800/80 space-y-2">
                              <div className="text-[11px] font-semibold text-slate-300 flex items-center justify-between">
                                <span>Tulis Catatan / Tips Tambahan untuk Staf Baru:</span>
                                <label className="flex items-center gap-1.5 cursor-pointer text-amber-300 text-[11px]">
                                  <input
                                    type="checkbox"
                                    checked={
                                      commentDrafts[step.id]?.isMentorTip !== undefined
                                        ? commentDrafts[step.id].isMentorTip
                                        : true
                                    }
                                    onChange={(e) =>
                                      handleDraftChange(step.id, 'isMentorTip', e.target.checked)
                                    }
                                    className="rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-0"
                                  />
                                  <span className="flex items-center gap-1">
                                    <Lightbulb className="w-3 h-3 text-amber-400" />
                                    Tandai sebagai Tips Mentor
                                  </span>
                                </label>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                <div>
                                  <input
                                    type="text"
                                    placeholder="Nama Pemberi Catatan (contoh: Coach Budi / Senior Staff)"
                                    value={
                                      commentDrafts[step.id]?.authorName !== undefined
                                        ? commentDrafts[step.id].authorName
                                        : currentUser?.fullName || ''
                                    }
                                    onChange={(e) =>
                                      handleDraftChange(step.id, 'authorName', e.target.value)
                                    }
                                    className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500/60"
                                  />
                                </div>
                                <div>
                                  <input
                                    type="text"
                                    placeholder="Peran/Jabatan (contoh: HEAD_COACH / Senior Mentor)"
                                    value={
                                      commentDrafts[step.id]?.authorRole !== undefined
                                        ? commentDrafts[step.id].authorRole
                                        : currentUser?.activeRoleCode || selectedRole
                                    }
                                    onChange={(e) =>
                                      handleDraftChange(step.id, 'authorRole', e.target.value)
                                    }
                                    className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500/60"
                                  />
                                </div>
                              </div>

                              <div className="flex flex-col sm:flex-row gap-2">
                                <textarea
                                  rows={2}
                                  placeholder="Tuliskan tips operasional, hal kritis yang wajib dicek, atau petunjuk khusus untuk staf baru pada langkah ini..."
                                  value={commentDrafts[step.id]?.content || ''}
                                  onChange={(e) =>
                                    handleDraftChange(step.id, 'content', e.target.value)
                                  }
                                  className="flex-1 bg-slate-900 border border-slate-800 rounded p-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500/60 resize-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleAddComment(step.id)}
                                  className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded text-xs font-bold flex items-center justify-center gap-1.5 shrink-0 transition-colors shadow-sm self-end sm:self-auto"
                                >
                                  <Send className="w-3 h-3" />
                                  <span>Kirim Catatan</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* TAB 2: RBAC PERMISSION MATRIX FOR SELECTED ROLE */}
          {activeGuideTab === 'permissions' && (
            <div className="p-4 rounded-lg border border-slate-800 bg-slate-950/80 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                <div>
                  <h5 className="text-xs font-mono uppercase tracking-wider text-amber-400 font-bold">
                    Matriks Otorisasi Domain untuk Role: {currentRoleDef.code}
                  </h5>
                  <p className="text-xs text-slate-400">
                    Menampilkan hak akses spesifik yang divalidasi oleh middleware server &amp; antarmuka pengguna.
                  </p>
                </div>
                <span className="text-[11px] font-mono text-emerald-400">
                  {
                    ALL_DOMAINS_LIST.filter((d) =>
                      hasPermission(selectedRole, d.code, 'view')
                    ).length
                  }{' '}
                  / {ALL_DOMAINS_LIST.length} Domain Terbuka
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {ALL_DOMAINS_LIST.map((dom) => {
                  const actions: PermissionAction[] =
                    selectedRole === 'SUPER_ADMIN'
                      ? [
                          'view',
                          'create',
                          'update',
                          'delete',
                          'approve',
                          'export',
                          'manage',
                          'process',
                          'audit',
                        ]
                      : ROLE_PERMISSION_MATRIX[selectedRole]?.[dom.code] || [];
                  const hasAccess = actions.length > 0;

                  return (
                    <div
                      key={dom.code}
                      className={`p-3 rounded border flex flex-col justify-between gap-2 ${
                        hasAccess
                          ? 'border-slate-800 bg-slate-900/60'
                          : 'border-slate-900 bg-slate-950/40 opacity-60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-100">{dom.label}</span>
                        {hasAccess ? (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 font-semibold">
                            DIIZINKAN ({actions.length})
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-500 flex items-center gap-1">
                            <Lock className="w-2.5 h-2.5" />
                            DIBATASI
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {hasAccess ? (
                          actions.map((act) => (
                            <span
                              key={act}
                              className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-amber-300"
                            >
                              {act}
                            </span>
                          ))
                        ) : (
                          <span className="text-[11px] text-slate-500 italic">
                            Tidak memiliki akses operasi pada domain ini
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: KPIS, BEST PRACTICES & DATABASE ACCOUNTS */}
          {activeGuideTab === 'kpis' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-lg border border-slate-800 bg-slate-950/80 space-y-2.5">
                  <h5 className="text-xs font-mono uppercase tracking-wider text-amber-400 font-bold">
                    Indikator Kinerja Utama (KPI Role {currentRoleDef.code})
                  </h5>
                  <ul className="space-y-2">
                    {currentPlaybook.primaryKpis.map((kpi, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-xs text-slate-200">
                        <span className="font-mono text-amber-400 font-bold">0{idx + 1}.</span>
                        <span>{kpi}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="p-4 rounded-lg border border-slate-800 bg-slate-950/80 space-y-2.5">
                  <h5 className="text-xs font-mono uppercase tracking-wider text-emerald-400 font-bold">
                    Panduan Praktik Terbaik (SOP &amp; Best Practices)
                  </h5>
                  <ul className="space-y-2">
                    {currentPlaybook.bestPractices.map((bp, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-xs text-slate-300">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                        <span>{bp}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Matching Personnel Accounts in Database */}
              <div className="p-4 rounded-lg border border-slate-800 bg-slate-950/80 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h5 className="text-xs font-mono uppercase tracking-wider text-amber-400 font-bold">
                      Akun Personel Terdaftar dengan Role {currentRoleDef.name}
                    </h5>
                    <p className="text-xs text-slate-400">
                      Anda dapat langsung masuk sebagai salah satu akun personel di bawah ini untuk mencoba workspace mereka.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onSwitchRole(selectedRole);
                      if (onClose) onClose();
                    }}
                    className="px-3 py-1.5 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded shrink-0"
                  >
                    Aktifkan Role {selectedRole}
                  </button>
                </div>

                {matchingDatabaseUsers.length > 0 ? (
                  <div className="grid grid-cols-1 gap-2">
                    {matchingDatabaseUsers.map((u) => {
                      const bName = u.branchId
                        ? branches.find((b) => b.id === u.branchId)?.name || 'Cabang Spesifik'
                        : 'Semua Cabang (Pusat)';
                      return (
                        <div
                          key={u.id}
                          className="p-3 rounded border border-slate-800 bg-slate-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                        >
                          <div>
                            <div className="text-xs font-bold text-slate-100">
                              {u.fullName}{' '}
                              <span className="font-mono text-[10px] text-amber-400">
                                ({u.activeRoleCode})
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {u.jobTitle || currentRoleDef.name} • {bName} • {u.email}
                            </div>
                          </div>
                          {onLoginAsUser && (
                            <button
                              type="button"
                              onClick={() => {
                                onLoginAsUser(u);
                                if (onClose) onClose();
                              }}
                              className="px-3 py-1.5 text-[11px] font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded shrink-0"
                            >
                              Masuk Sebagai {u.fullName.split(' ')[0]}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-3 rounded border border-slate-800/80 bg-slate-900/40 text-xs text-slate-400">
                    Gunakan tombol <strong>Aktifkan Role {selectedRole}</strong> di atas untuk langsung menyimulasikan alur kerja role ini.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [systemState, setSystemState] = useState<SystemState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeNav, setActiveNav] = useState<NavSection>('dashboard');
  const [branchFilter, setBranchFilter] = useState<string>('ALL');
  const [notifDrawerOpen, setNotifDrawerOpen] = useState(false);
  const [qrHubOpen, setQrHubOpen] = useState(false);
  const [workFunctionModalOpen, setWorkFunctionModalOpen] = useState(false);
  const [docGuideOpen, setDocGuideOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(
    null
  );

  const notify = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 4500);
  }, []);

  const fetchSystemState = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest<SystemState>('/api/state');
      setSystemState(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal memuat state sistem dari server.');
    } finally {
      setLoading(false);
    }
  }, []);

  const [explicitlyLoggedOut, setExplicitlyLoggedOut] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        const token = await user.getIdToken();
        setInMemoryToken(token);
        setExplicitlyLoggedOut(false);
        await fetchSystemState();
      } else if (!explicitlyLoggedOut) {
        setInMemoryToken('ZAMOA_CBTC_DIRECT_SESSION');
        await fetchSystemState();
      } else {
        setInMemoryToken(null);
        setSystemState(null);
      }
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, [fetchSystemState, explicitlyLoggedOut]);

  const handleLogin = async () => {
    try {
      setError(null);
      await signInWithPopup(auth, googleAuthProvider);
    } catch {
      // Fallback to direct Cloud SQL authenticated session if popup is blocked in iframe
      setExplicitlyLoggedOut(false);
      setInMemoryToken('ZAMOA_CBTC_DIRECT_SESSION');
      await fetchSystemState();
    }
  };

  const handleLogout = async () => {
    setExplicitlyLoggedOut(true);
    await signOut(auth);
    setInMemoryToken(null);
    setSystemState(null);
  };

  const handleSwitchRole = async (newRoleCode: string) => {
    try {
      setActAsUserHeader(null);
      await apiRequest('/api/context/switch', {
        method: 'POST',
        body: JSON.stringify({ activeRoleCode: newRoleCode }),
      });
      const roleCfg = systemState?.jobRoleConfigs?.find((c) => c.roleCode === newRoleCode);
      const targetNav = (roleCfg?.defaultLandingNav || 'dashboard') as NavSection;
      if (NAV_ITEMS.some((n) => n.id === targetNav)) {
        setActiveNav(targetNav);
      }
      const navLabel = NAV_ITEMS.find((n) => n.id === targetNav)?.label || targetNav;
      notify(
        `Masuk sesuai fungsi role ${newRoleCode} (${roleCfg?.jobTitleDefault || newRoleCode}) → Modul Kerja: ${navLabel}`
      );
      await fetchSystemState();
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Gagal mengubah role', 'error');
    }
  };

  const handleLoginAsDatabaseUser = async (targetUser: SystemState['users'][number]) => {
    try {
      setActAsUserHeader(targetUser.id);
      if (targetUser.branchId) {
        setBranchFilter(targetUser.branchId);
        setBranchHeader(targetUser.branchId);
      } else {
        setBranchFilter('ALL');
        setBranchHeader('ALL');
      }
      const roleCfg = systemState?.jobRoleConfigs?.find(
        (c) => c.roleCode === targetUser.activeRoleCode
      );
      const targetNav = (targetUser.defaultLandingModule ||
        roleCfg?.defaultLandingNav ||
        'dashboard') as NavSection;
      if (NAV_ITEMS.some((n) => n.id === targetNav)) {
        setActiveNav(targetNav);
      }
      await fetchSystemState();
      setWorkFunctionModalOpen(false);
      const navLabel = NAV_ITEMS.find((n) => n.id === targetNav)?.label || targetNav;
      notify(
        `Masuk aplikasi sebagai ${targetUser.fullName} (${targetUser.jobTitle || targetUser.activeRoleCode}) → Diarahkan ke: ${navLabel}`
      );
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Gagal beralih pengguna', 'error');
    }
  };

  const handleSwitchBranch = async (newBranchId: string) => {
    try {
      setBranchFilter(newBranchId);
      setBranchHeader(newBranchId);
      await apiRequest('/api/context/switch', {
        method: 'POST',
        body: JSON.stringify({ branchId: newBranchId }),
      });
      notify(
        newBranchId === 'ALL'
          ? 'Menampilkan data konsolidasi seluruh cabang.'
          : 'Filter konteks cabang diperbarui.'
      );
      await fetchSystemState();
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Gagal mengubah cabang', 'error');
    }
  };

  // Unauthenticated Landing / Login Gate (shown only when user explicitly logs out)
  if (authReady && !firebaseUser && explicitlyLoggedOut) {
    return (
      <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col justify-between p-6 md:p-12">
        <header className="flex items-center justify-between border-b border-slate-800/80 pb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500 flex items-center justify-center text-slate-950 font-black font-display text-lg">
              ZC
            </div>
            <div>
              <div className="text-xs font-mono text-amber-400 tracking-widest uppercase">
                ZAMOA CBTC BASKETBALL ACADEMY
              </div>
              <h1 className="text-lg font-bold text-slate-100 font-display">
                Enterprise Academy & Financial Management System
              </h1>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogin}
            className="px-4 py-2.5 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-md flex items-center gap-2 transition-colors"
          >
            <LogIn className="w-4 h-4" />
            <span>Masuk dengan Google OAuth</span>
          </button>
        </header>

        <main className="my-auto max-w-4xl py-12 space-y-8">
          <div className="space-y-4">
            <div className="text-xs font-mono uppercase tracking-widest text-amber-400">
              SINGLE SOURCE OF TRUTH • CLOUD SQL POSTGRESQL • 12-ROLE RBAC • DOUBLE-ENTRY ACCOUNTING
            </div>
            <h2 className="text-3xl md:text-5xl font-bold text-slate-100 font-display leading-tight">
              Ekosistem Operasional, Kepelatihan, Medis & Akuntansi Akademi Bola Basket Terpadu.
            </h2>
            <p className="text-base text-slate-400 max-w-2xl">
              Kelola seluruh siklus hidup atlet, wali, kurikulum latihan, presensi anti-duplikasi, rapor perkembangan atlet, turnamen, rekam medis Return-to-Play, penggajian pelatih berbasis sesi valid, ledger inventaris, hingga jurnal umum double-entry dalam satu platform.
            </p>
          </div>

          {error && (
            <div className="p-4 rounded-lg border border-red-800 bg-red-950/30 text-sm text-red-200">
              {error}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={handleLogin}
              className="px-6 py-3.5 text-sm font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-md flex items-center gap-2.5 shadow-lg transition-colors"
            >
              <LogIn className="w-4 h-4" />
              <span>Masuk ke Sistem Operasional ZAMOA CBTC</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-6 border-t border-slate-800/80 text-xs">
            <div className="p-4 rounded-lg border border-slate-800 bg-slate-900/40">
              <div className="font-mono text-amber-400 font-semibold mb-1">
                01 / OPERASIONAL & KEPELATIHAN
              </div>
              <p className="text-slate-400">
                Pendaftaran end-to-end, jadwal lapangan, presensi QR/Coach, evaluasi teknis/fisik/mental, dan box score turnamen.
              </p>
            </div>
            <div className="p-4 rounded-lg border border-slate-800 bg-slate-900/40">
              <div className="font-mono text-amber-400 font-semibold mb-1">
                02 / KEUANGAN & DOUBLE-ENTRY
              </div>
              <p className="text-slate-400">
                Otomasi invoice membership, kwitansi pembayaran, payroll sesi pelatih, buku besar COA, dan reversal jurnal audit.
              </p>
            </div>
            <div className="p-4 rounded-lg border border-slate-800 bg-slate-900/40">
              <div className="font-mono text-amber-400 font-semibold mb-1">
                03 / MULTI-CABANG & 12-ROLE RBAC
              </div>
              <p className="text-slate-400">
                Isolasi wewenang cabang, privasi rekam medis atlet, pembatasan data anak untuk orang tua, dan jejak audit JSONB.
              </p>
            </div>
          </div>
        </main>

        <footer className="border-t border-slate-800/80 pt-6 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500">
          <span>© 2026 PT Zamoa Cipta Bola Talenta (ZAMOA CBTC Basketball Academy)</span>
          <span className="font-mono">PostgreSQL 3NF • Drizzle ORM • Firebase Auth</span>
        </footer>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col lg:flex-row">
      {/* LEFT SIDEBAR NAVIGATION (240px - 280px) */}
      <aside className="w-full lg:w-68 shrink-0 border-b lg:border-b-0 lg:border-r border-slate-800 bg-slate-950/90 flex flex-col justify-between">
        <div>
          {/* Brand Header */}
          <div className="px-5 py-4 border-b border-slate-800 flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-amber-500 flex items-center justify-center text-slate-950 font-black font-display text-base shrink-0">
              ZC
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-mono text-amber-400 tracking-wider uppercase truncate">
                ZAMOA CBTC ACADEMY
              </div>
              <div className="text-sm font-bold text-slate-100 truncate font-display">
                Management System
              </div>
            </div>
          </div>

          {/* Primary Navigation (Filtered & Ordered by User Job & Function) */}
          <nav className="p-3 space-y-1">
            {(() => {
              const roleCode = systemState?.currentUser.activeRoleCode || 'SUPER_ADMIN';
              const activeRoleCfg = systemState?.jobRoleConfigs?.find(
                (c) => c.roleCode === roleCode
              );
              const appSettings = systemState ? getEffectiveAppSettings(systemState) : null;
              const filterByJob =
                appSettings?.registrationAndWorkspace?.filterSidebarByJobFunction ?? true;
              const allowedModulesList =
                systemState?.currentUser.allowedModulesJson &&
                systemState.currentUser.allowedModulesJson.length > 0
                  ? systemState.currentUser.allowedModulesJson
                  : activeRoleCfg?.allowedNavModules && activeRoleCfg.allowedNavModules.length > 0
                  ? activeRoleCfg.allowedNavModules
                  : NAV_ITEMS.map((i) => i.id);

              const visibleNavItems =
                filterByJob && roleCode !== 'SUPER_ADMIN' && roleCode !== 'ORG_ADMIN'
                  ? NAV_ITEMS.filter(
                      (item) => item.id === 'settings' || allowedModulesList.includes(item.id)
                    )
                  : NAV_ITEMS;

              return visibleNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeNav === item.id;
                const isDefaultLanding =
                  (systemState?.currentUser.defaultLandingModule ||
                    activeRoleCfg?.defaultLandingNav) === item.id;
                const allowed =
                  item.id === 'settings' ||
                  hasPermission(roleCode, item.domain, 'view') ||
                  (item.id === 'hr_inventory' &&
                    (hasPermission(roleCode, 'payroll', 'view') ||
                      hasPermission(roleCode, 'inventory', 'view'))) ||
                  (item.id === 'competition' && hasPermission(roleCode, 'medical', 'view')) ||
                  (item.id === 'comm_admin' &&
                    (hasPermission(roleCode, 'reports', 'view') ||
                      hasPermission(roleCode, 'documents', 'view') ||
                      hasPermission(roleCode, 'administration', 'view')));

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveNav(item.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-md transition-colors flex items-start gap-3 ${
                      isActive
                        ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                        : allowed
                        ? 'text-slate-300 hover:bg-slate-900 hover:text-slate-100'
                        : 'text-slate-600 hover:bg-slate-900/40'
                    }`}
                  >
                    <Icon className="w-4 h-4 mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-semibold truncate">{item.label}</span>
                        {isDefaultLanding && (
                          <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-emerald-500/20 text-emerald-300 shrink-0">
                            UTAMA
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500 truncate">{item.subtitle}</div>
                    </div>
                  </button>
                );
              });
            })()}
          </nav>
        </div>

        {/* User Footer */}
        {systemState && (
          <div className="p-4 border-t border-slate-800 space-y-2.5 bg-slate-900/30">
            <div className="text-xs space-y-0.5">
              <div className="font-semibold text-slate-100 truncate">
                {systemState.currentUser.fullName}
              </div>
              <div className="text-[11px] font-mono text-amber-400 truncate">
                {systemState.currentUser.jobTitle ||
                  systemState.jobRoleConfigs?.find(
                    (c) => c.roleCode === systemState.currentUser.activeRoleCode
                  )?.jobTitleDefault ||
                  systemState.currentUser.activeRoleCode}
              </div>
              <div className="text-slate-400 truncate text-[11px]">
                {systemState.currentUser.email}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setActiveNav('settings')}
              className={`w-full px-3 py-1.5 text-xs font-semibold rounded flex items-center justify-center gap-1.5 transition-colors ${
                activeNav === 'settings'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-amber-300 hover:text-amber-200 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40'
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Pengaturan Aplikasi (Master)</span>
            </button>
            <button
              type="button"
              onClick={() => setDocGuideOpen(true)}
              className="w-full px-3 py-1.5 text-xs font-semibold text-sky-300 hover:text-sky-200 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 rounded flex items-center justify-center gap-1.5"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Panduan &amp; SOP RBAC</span>
            </button>
            <button
              type="button"
              onClick={() => setWorkFunctionModalOpen(true)}
              className="w-full px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:text-emerald-200 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded flex items-center justify-center gap-1.5"
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Masuk Sesuai Kerja &amp; Fungsi</span>
            </button>
            <button
              type="button"
              onClick={() => setQrHubOpen(true)}
              className="w-full px-3 py-1.5 text-xs font-semibold text-amber-300 hover:text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded flex items-center justify-center gap-1.5"
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>Kartu QR Saya & Direktori</span>
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="w-full px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded flex items-center justify-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Keluar Sesi</span>
            </button>
          </div>
        )}
      </aside>

      {/* MAIN WORKSPACE */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar with Role Switcher & Multi-Branch Context */}
        <header className="px-6 py-3.5 border-b border-slate-800 bg-slate-950/70 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-base font-bold text-slate-100 font-display">
              {NAV_ITEMS.find((n) => n.id === activeNav)?.label}
            </h1>
            <p className="text-xs text-slate-400">
              {NAV_ITEMS.find((n) => n.id === activeNav)?.subtitle}
            </p>
          </div>

          {systemState && (
            <div className="flex flex-wrap items-center gap-3">
              {/* Multi-Branch Selector */}
              <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-md px-2.5 py-1.5">
                <Building2 className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-[11px] text-slate-400">Cabang:</span>
                <select
                  value={getBranchHeader()}
                  onChange={(e) => handleSwitchBranch(e.target.value)}
                  className="text-xs font-mono bg-transparent text-slate-100 focus:outline-none"
                >
                  <option value="ALL" className="bg-slate-900">
                    SEMUA CABANG (KONSOLIDASI)
                  </option>
                  {systemState.branches.map((b) => (
                    <option key={b.id} value={b.id} className="bg-slate-900">
                      {b.name} ({b.code})
                    </option>
                  ))}
                </select>
              </div>

              {/* Active RBAC Role Simulator / Switcher */}
              <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-md px-2.5 py-1.5">
                <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-[11px] text-slate-400">Role RBAC:</span>
                <select
                  value={systemState.currentUser.activeRoleCode}
                  onChange={(e) => handleSwitchRole(e.target.value)}
                  className="text-xs font-mono font-semibold bg-transparent text-amber-400 focus:outline-none"
                >
                  {SYSTEM_ROLES.map((r) => (
                    <option key={r.code} value={r.code} className="bg-slate-900 text-slate-100">
                      {r.code} — {r.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Master Application Settings Button */}
              <button
                type="button"
                onClick={() => setActiveNav('settings')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md flex items-center gap-1.5 transition-colors ${
                  activeNav === 'settings'
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'bg-slate-900 hover:bg-slate-800 text-amber-400 border border-amber-500/40'
                }`}
                title="Buka Menu Pengaturan Aplikasi (Atur Semua Modul)"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Pengaturan Aplikasi</span>
              </button>

              {/* Portal Masuk Sesuai Kerja & Fungsi Button */}
              <button
                type="button"
                onClick={() => setWorkFunctionModalOpen(true)}
                className="px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:text-emerald-200 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 rounded-md flex items-center gap-1.5"
                title="Masuk Aplikasi Sesuai Kerja & Fungsi Pengguna"
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>Portal Kerja & Fungsi ({systemState.currentUser.activeRoleCode})</span>
              </button>

              {/* My Digital QR ID & All QR Directory Button */}
              <button
                type="button"
                onClick={() => setQrHubOpen(true)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-md flex items-center gap-1.5 shadow-sm"
                title="Lihat Kartu QR Saya, Pemain, Pelatih & Staf"
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>Kartu QR Saya & Personel</span>
              </button>

              {/* Digital Notification Center Bell */}
              <button
                type="button"
                onClick={() => setNotifDrawerOpen(true)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-200 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-md flex items-center gap-2"
                title="Pusat Notifikasi Digital"
              >
                <Bell className="w-3.5 h-3.5 text-amber-400" />
                <span>Notifikasi Digital</span>
                {systemState.notifications.filter((n) => !n.isRead).length > 0 && (
                  <span className="font-mono text-amber-400 font-bold">
                    ({systemState.notifications.filter((n) => !n.isRead).length})
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={fetchSystemState}
                className="p-2 text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-md"
                title="Sinkronisasi Data"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-amber-400' : ''}`} />
              </button>
            </div>
          )}
        </header>

        {/* Toast Notification Banner */}
        {toast && (
          <div
            className={`mx-6 mt-4 px-4 py-3 rounded-md border text-xs font-medium flex items-center justify-between ${
              toast.type === 'error'
                ? 'bg-red-950/60 border-red-800 text-red-200'
                : 'bg-emerald-950/60 border-emerald-800 text-emerald-200'
            }`}
          >
            <span>{toast.message}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="text-slate-400 hover:text-white ml-4"
            >
              ✕
            </button>
          </div>
        )}

        {/* Active Work Desk & Job Function Banner */}
        {systemState && (() => {
          const roleCode = systemState.currentUser.activeRoleCode;
          const roleCfg = systemState.jobRoleConfigs?.find((c) => c.roleCode === roleCode);
          const jobTitle =
            systemState.currentUser.jobTitle || roleCfg?.jobTitleDefault || roleCode;
          const dept =
            systemState.currentUser.department || roleCfg?.department || 'OPERASIONAL';
          const workSummary =
            systemState.currentUser.jobFunction ||
            roleCfg?.workFunctionSummary ||
            'Akses operasional sesuai otorisasi role RBAC.';
          const allowedNavs =
            systemState.currentUser.allowedModulesJson &&
            systemState.currentUser.allowedModulesJson.length > 0
              ? systemState.currentUser.allowedModulesJson
              : roleCfg?.allowedNavModules || ['dashboard'];

          return (
            <div className="mx-6 mt-4 px-4 py-3 rounded-lg border border-slate-800 bg-slate-900/60 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/40 text-amber-300 font-bold">
                    FUNGSI KERJA AKTIF: {dept}
                  </span>
                  <span className="font-semibold text-slate-100">
                    {systemState.currentUser.fullName}
                  </span>
                  <span className="text-slate-400">—</span>
                  <span className="font-mono text-emerald-400 font-semibold">{jobTitle}</span>
                </div>
                <p className="text-xs text-slate-400">{workSummary}</p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                {NAV_ITEMS.filter((n) => allowedNavs.includes(n.id))
                  .slice(0, 4)
                  .map((nav) => (
                    <button
                      key={nav.id}
                      type="button"
                      onClick={() => setActiveNav(nav.id)}
                      className={`px-2.5 py-1 text-[11px] font-medium rounded border transition-colors ${
                        activeNav === nav.id
                          ? 'bg-amber-500 text-slate-950 border-amber-400 font-semibold'
                          : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-600'
                      }`}
                    >
                      {nav.label.split('&')[0].trim()}
                    </button>
                  ))}
                <button
                  type="button"
                  onClick={() => setDocGuideOpen(true)}
                  className="px-2.5 py-1 text-[11px] font-semibold bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/40 rounded flex items-center gap-1"
                >
                  <BookOpen className="w-3 h-3" />
                  <span>Panduan Alur Kerja Role Ini</span>
                </button>
                <button
                  type="button"
                  onClick={() => setWorkFunctionModalOpen(true)}
                  className="px-2.5 py-1 text-[11px] font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 rounded"
                >
                  Ganti Pengguna / Fungsi
                </button>
              </div>
            </div>
          );
        })()}

        {/* Main Content Viewport */}
        <main className="p-6 flex-1 overflow-y-auto">
          {!authReady || (loading && !systemState) ? (
            <LoadingState message="Memuat ekosistem data ZAMOA CBTC dari Cloud SQL PostgreSQL..." />
          ) : error ? (
            <ErrorState message={error} onRetry={fetchSystemState} />
          ) : systemState ? (
            <>
              {activeNav === 'dashboard' && (
                <DashboardView
                  state={systemState}
                  onNavigate={(sec) => setActiveNav(sec as NavSection)}
                  onRefresh={fetchSystemState}
                  notify={notify}
                />
              )}

              {activeNav === 'athletes' &&
                (hasPermission(systemState.currentUser.activeRoleCode, 'athletes', 'view') ? (
                  <AthletesParentsView
                    state={systemState}
                    onRefresh={fetchSystemState}
                    notify={notify}
                  />
                ) : (
                  <UnauthorizedState
                    roleCode={systemState.currentUser.activeRoleCode}
                    domainName="Manajemen Atlet & Orang Tua"
                  />
                ))}

              {activeNav === 'training' &&
                (hasPermission(systemState.currentUser.activeRoleCode, 'training', 'view') ? (
                  <AcademyTrainingView
                    state={systemState}
                    onRefresh={fetchSystemState}
                    notify={notify}
                  />
                ) : (
                  <UnauthorizedState
                    roleCode={systemState.currentUser.activeRoleCode}
                    domainName="Akademi, Latihan & Evaluasi"
                  />
                ))}

              {activeNav === 'competition' &&
                (hasPermission(systemState.currentUser.activeRoleCode, 'competition', 'view') ||
                hasPermission(systemState.currentUser.activeRoleCode, 'medical', 'view') ? (
                  <CompetitionMedicalView
                    state={systemState}
                    onRefresh={fetchSystemState}
                    notify={notify}
                  />
                ) : (
                  <UnauthorizedState
                    roleCode={systemState.currentUser.activeRoleCode}
                    domainName="Kompetisi & Rekam Medis"
                  />
                ))}

              {activeNav === 'hr_inventory' &&
                (hasPermission(systemState.currentUser.activeRoleCode, 'hr', 'view') ||
                hasPermission(systemState.currentUser.activeRoleCode, 'payroll', 'view') ||
                hasPermission(systemState.currentUser.activeRoleCode, 'inventory', 'view') ? (
                  <HrPayrollInventoryView
                    state={systemState}
                    onRefresh={fetchSystemState}
                    notify={notify}
                  />
                ) : (
                  <UnauthorizedState
                    roleCode={systemState.currentUser.activeRoleCode}
                    domainName="HR, Payroll & Inventaris"
                  />
                ))}

              {activeNav === 'finance' &&
                (hasPermission(systemState.currentUser.activeRoleCode, 'finance', 'view') ||
                hasPermission(systemState.currentUser.activeRoleCode, 'accounting', 'view') ? (
                  <FinanceAccountingView
                    state={systemState}
                    onRefresh={fetchSystemState}
                    notify={notify}
                  />
                ) : (
                  <UnauthorizedState
                    roleCode={systemState.currentUser.activeRoleCode}
                    domainName="Keuangan & Akuntansi Double-Entry"
                  />
                ))}

              {activeNav === 'comm_admin' && (
                <CommDocsReportsAdminView
                  state={systemState}
                  onRefresh={fetchSystemState}
                  notify={notify}
                />
              )}

              {activeNav === 'settings' && (
                <AppSettingsView
                  state={systemState}
                  onRefresh={fetchSystemState}
                  notify={notify}
                />
              )}
            </>
          ) : null}
        </main>
      </div>

      {/* GLOBAL DIGITAL NOTIFICATION CENTER DRAWER */}
      <Drawer
        open={notifDrawerOpen}
        onClose={() => setNotifDrawerOpen(false)}
        title="Pusat Notifikasi Digital Terpadu"
      >
        {systemState && (
          <div className="space-y-4">
            <div className="p-3.5 rounded border border-slate-800 bg-slate-900/60 flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-slate-300">
                <span className="font-semibold text-slate-100">
                  {systemState.notifications.filter((n) => !n.isRead).length} Notifikasi Belum Dibaca
                </span>{' '}
                dari total {systemState.notifications.length} pesan digital
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    const perm = await requestBrowserNotificationPermission();
                    if (perm === 'granted') {
                      sendBrowserDigitalNotification(
                        'Push Browser ZAMOA CBTC Aktif',
                        'Notifikasi digital kini tersambung langsung ke layar perangkat Anda.',
                        'SYSTEM'
                      );
                      notify('Push Notifikasi Browser berhasil diaktifkan.');
                    }
                  }}
                  className="px-2.5 py-1 text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded"
                >
                  Aktifkan Push Browser
                </button>
                {systemState.notifications.some((n) => !n.isRead) && (
                  <button
                    type="button"
                    onClick={async () => {
                      await apiRequest('/api/notifications/read-all', { method: 'POST' });
                      notify('Seluruh notifikasi digital telah ditandai dibaca.');
                      await fetchSystemState();
                    }}
                    className="px-2.5 py-1 text-[11px] font-semibold bg-amber-500 text-slate-950 rounded flex items-center gap-1"
                  >
                    <CheckCheck className="w-3 h-3" />
                    <span>Tandai Semua Baca</span>
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-2.5">
              {systemState.notifications.map((n) => (
                <div
                  key={n.id}
                  className={`p-3.5 rounded border space-y-2 ${
                    n.isRead
                      ? 'border-slate-800/60 bg-slate-950/40 opacity-80'
                      : 'border-amber-500/40 bg-amber-950/15'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-[11px] font-mono text-amber-400">
                        {n.category} · {new Date(n.createdAt).toLocaleString('id-ID')}
                      </div>
                      <div className="text-sm font-semibold text-slate-100 mt-0.5">{n.title}</div>
                      <p className="text-xs text-slate-300 mt-1 leading-relaxed">{n.message}</p>
                    </div>
                    {!n.isRead && (
                      <button
                        type="button"
                        onClick={async () => {
                          await apiRequest(`/api/notifications/${n.id}/read`, { method: 'PATCH' });
                          await fetchSystemState();
                        }}
                        className="px-2 py-1 text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-emerald-300 rounded shrink-0"
                      >
                        Baca
                      </button>
                    )}
                  </div>
                  <div className="pt-1.5 border-t border-slate-800/60 flex justify-end">
                    <button
                      type="button"
                      onClick={async () => {
                        const text = formatDigitalNotificationCard({
                          ...n,
                          organizationName: systemState.organization.name,
                        });
                        await navigator.clipboard.writeText(text);
                        notify('Kartu notifikasi digital berhasil disalin.');
                      }}
                      className="px-2 py-1 text-[11px] text-slate-300 hover:text-white bg-slate-900 border border-slate-800 rounded flex items-center gap-1"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Salin Kartu Digital</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setNotifDrawerOpen(false);
                  setActiveNav('comm_admin');
                }}
                className="px-3.5 py-2 text-xs font-semibold bg-amber-500 text-slate-950 rounded flex items-center gap-1.5"
              >
                <span>Buka Pusat Otomasi & Siaran Digital</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </Drawer>

      {/* DIGITAL QR PASS & DIRECTORY DRAWER FOR PLAYERS, COACHES & STAFF */}
      <Drawer
        open={qrHubOpen}
        onClose={() => setQrHubOpen(false)}
        title="Pusat Kartu ID & Kode QR Digital (Pemain, Pelatih & Staf)"
        subtitle="Setiap Pemain, Pelatih, dan Staf memiliki Kode QR resmi yang dapat dilihat, diunduh (.SVG), atau dipindai untuk presensi digital."
      >
        {systemState && (
          <DigitalQrPassHub
            state={systemState}
            onRefresh={fetchSystemState}
            notify={notify}
            defaultTab="my_card"
          />
        )}
      </Drawer>

      {/* PORTAL MASUK APLIKASI SESUAI KERJA & FUNGSI PENGGUNA MODAL */}
      <Modal
        open={workFunctionModalOpen}
        onClose={() => setWorkFunctionModalOpen(false)}
        title="Portal Masuk Aplikasi Sesuai Kerja & Fungsi Pengguna (Database RBAC)"
      >
        {systemState && (
          <div className="space-y-5 max-h-[75vh] overflow-y-auto pr-1">
            <div className="p-3.5 rounded-lg border border-amber-500/30 bg-amber-950/15 text-xs text-slate-300 space-y-1">
              <div className="font-semibold text-amber-300">
                Otomatisasi Workspace & Navigasi Berdasarkan Pekerjaan dan Fungsi
              </div>
              <p>
                Pilih akun pengguna dari database PostgreSQL di bawah ini untuk masuk ke aplikasi sesuai jabatan, departemen, cakupan cabang, dan modul kerja utamanya. Untuk mengubah konfigurasi fungsi kerja atau menambah pengguna, buka menu <strong>Pengaturan Aplikasi → Kerja & Fungsi Pengguna</strong>.
              </p>
            </div>

            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-mono uppercase tracking-wider text-amber-400">
                  Daftar Akun Pengguna Resmi di Database ({systemState.users.length} Akun)
                </h4>
                <button
                  type="button"
                  onClick={() => {
                    setWorkFunctionModalOpen(false);
                    setActiveNav('settings');
                  }}
                  className="text-xs font-semibold text-amber-400 hover:text-amber-300 underline"
                >
                  Buka Pengaturan Kerja & Fungsi →
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {systemState.users.map((u) => {
                  const isCurrent = systemState.currentUser.id === u.id;
                  const roleCfg = systemState.jobRoleConfigs?.find(
                    (c) => c.roleCode === u.activeRoleCode
                  );
                  const branchName = u.branchId
                    ? systemState.branches.find((b) => b.id === u.branchId)?.name || 'Cabang'
                    : 'Semua Cabang (Pusat)';
                  const targetLanding =
                    u.defaultLandingModule || roleCfg?.defaultLandingNav || 'dashboard';
                  const landingNavLabel =
                    NAV_ITEMS.find((n) => n.id === targetLanding)?.label || targetLanding;

                  return (
                    <div
                      key={u.id}
                      className={`p-3.5 rounded-lg border transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        isCurrent
                          ? 'border-emerald-500/60 bg-emerald-950/20'
                          : 'border-slate-800 bg-slate-950/70 hover:border-slate-700'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-bold text-slate-100">{u.fullName}</span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/40 text-amber-300 font-semibold">
                            {u.activeRoleCode}
                          </span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300">
                            {u.department || roleCfg?.department || 'OPERASIONAL'}
                          </span>
                          {isCurrent && (
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500 text-slate-950 font-bold">
                              SEDANG AKTIF
                            </span>
                          )}
                        </div>
                        <div className="text-xs font-semibold text-emerald-400">
                          Jabatan: {u.jobTitle || roleCfg?.jobTitleDefault || u.activeRoleCode} •{' '}
                          <span className="text-slate-400 font-normal">{branchName}</span>
                        </div>
                        <p className="text-xs text-slate-400">
                          {u.jobFunction || roleCfg?.workFunctionSummary}
                        </p>
                        <div className="text-[11px] font-mono text-slate-400 pt-0.5">
                          Email: <span className="text-slate-200">{u.email}</span> • Halaman Masuk:{' '}
                          <span className="text-amber-300">{landingNavLabel}</span>
                        </div>
                      </div>

                      <div className="shrink-0">
                        <button
                          type="button"
                          onClick={() => handleLoginAsDatabaseUser(u)}
                          className={`px-3.5 py-2 text-xs font-semibold rounded-md flex items-center gap-1.5 ${
                            isCurrent
                              ? 'bg-emerald-500 text-slate-950'
                              : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                          }`}
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                          <span>{isCurrent ? 'Muat Ulang Fungsi' : 'Masuk Sebagai Akun Ini'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* INTERACTIVE RBAC DOCUMENTATION GUIDE MODAL */}
      <Modal
        open={docGuideOpen}
        onClose={() => setDocGuideOpen(false)}
        title="Panduan Penggunaan Interaktif & Alur Kerja Operasional per Role RBAC"
      >
        {systemState && (
          <DocumentationGuide
            activeRoleCode={systemState.currentUser.activeRoleCode}
            currentUser={systemState.currentUser}
            users={systemState.users}
            branches={systemState.branches}
            organizationName={systemState.organization.name}
            onNavigateToModule={(targetNav) => setActiveNav(targetNav)}
            onSwitchRole={(roleCode) => handleSwitchRole(roleCode)}
            onLoginAsUser={(u) => handleLoginAsDatabaseUser(u)}
            onClose={() => setDocGuideOpen(false)}
            notify={notify}
          />
        )}
      </Modal>
    </div>
  );
}
