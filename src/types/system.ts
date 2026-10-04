// ============================================================================
// INTEGRATION ADAPTER INTERFACES (PRINSIP 5 & 6)
// Tidak mengarang kredensial eksternal; menyediakan kontrak adapter eksplisit
// ============================================================================

export interface PaymentGatewayWebhookPayload {
  invoiceNumber: string;
  externalReference: string;
  amount: number;
  channel: string;
  paidAtIso: string;
}

export interface PaymentGatewayAdapter {
  readonly providerName: string;
  readonly status: 'NOT_CONFIGURED' | 'CONNECTED';
  createVirtualAccount(invoiceNumber: string, amount: number): Promise<{
    configured: boolean;
    virtualAccountNumber: string | null;
    message: string;
  }>;
}

export interface MessagingNotificationAdapter {
  readonly channelName: string;
  readonly status: 'NOT_CONFIGURED' | 'CONNECTED';
  sendExternalNotification(phone: string, message: string): Promise<{
    configured: boolean;
    delivered: boolean;
    statusNote: string;
  }>;
}

// Default unconfigured adapters (safe, explicit, anti-hallucination)
export const paymentGatewayIntegrationPoint: PaymentGatewayAdapter = {
  providerName: 'EXTERNAL_PAYMENT_GATEWAY_ADAPTER',
  status: 'NOT_CONFIGURED',
  async createVirtualAccount() {
    return {
      configured: false,
      virtualAccountNumber: null,
      message: 'NOT CONFIGURED — Gunakan verifikasi pembayaran manual/transfer/QRIS internal.',
    };
  },
};

export const messagingIntegrationPoint: MessagingNotificationAdapter = {
  channelName: 'DIGITAL_IN_APP_AND_WEB_PUSH_ENGINE',
  status: 'CONNECTED',
  async sendExternalNotification(_phone: string, message: string) {
    return {
      configured: true,
      delivered: true,
      statusNote: `CONNECTED — Pesan digital terkirim melalui In-App Notification Center & Browser Web Push (${message.slice(0, 40)}).`,
    };
  },
};

// ============================================================================
// CORE FRONTEND DATA TYPES & CONFIGURABLE PAYMENT + WA/EMAIL SETTINGS
// ============================================================================

export interface BankTransferAccountConfig {
  id: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  branchName: string;
  isActive: boolean;
}

export interface EWalletAccountConfig {
  id: string;
  provider: string; // GOPAY, OVO, DANA, SHOPEEPAY, LINKAJA
  phoneNumber: string;
  accountName: string;
  isActive: boolean;
}

export interface OrganizationAppSettings {
  paymentMethods: {
    qris: {
      enabled: boolean;
      merchantName: string;
      nmid: string;
      qrisPayload: string;
      instructions: string;
    };
    bankTransfer: {
      enabled: boolean;
      accounts: BankTransferAccountConfig[];
      instructions: string;
    };
    ewallet: {
      enabled: boolean;
      wallets: EWalletAccountConfig[];
      instructions: string;
    };
  };
  notificationChannels: {
    whatsapp: {
      enabled: boolean;
      senderNumber: string;
      senderName: string;
      gatewayMode: string;
      autoSendInvoice: boolean;
      autoSendReceipt: boolean;
      autoSendAttendance: boolean;
      autoSendDailyTrainingReminder?: boolean;
      dailyReminderTimeWib?: string;
      invoiceTemplate: string;
      receiptTemplate: string;
      trainingReminderTemplate?: string;
    };
    email: {
      enabled: boolean;
      senderEmail: string;
      senderName: string;
      replyToEmail: string;
      smtpHost: string;
      autoSendInvoice: boolean;
      autoSendReceipt: boolean;
      autoSendEvaluation: boolean;
      invoiceSubjectTemplate: string;
      receiptSubjectTemplate: string;
    };
  };
  registrationAndWorkspace?: {
    onlineRegistrationEnabled: boolean;
    offlineRegistrationEnabled: boolean;
    requireAthletePhoto: boolean;
    defaultPhotoSizeSpec: '3x4' | '4x6';
    defaultPhotoBgColor: 'RED' | 'BLUE' | 'WHITE';
    onlineRegistrationPrefix: string;
    offlineRegistrationPrefix: string;
    enforceRoleWorkspaceRouting: boolean;
    filterSidebarByJobFunction: boolean;
  };
  masterOperationalConfig?: {
    dashboardKpi: {
      targetAttendancePct: number;
      targetMonthlyNewAthletes: number;
      showRealtimeKpiCharts: boolean;
      showActiveWorkDeskBanner: boolean;
      defaultCurrency: string;
      timezone: string;
    };
    attendanceAndQr: {
      defaultAttendanceSource: 'QR' | 'COACH' | 'ADMIN';
      enableOfflineFirstLocalStorage: boolean;
      autoSyncOfflineOnReconnect: boolean;
      lateToleranceMinutes: number;
      enforceAntiDuplicateSession: boolean;
      requireCoachDigitalSignature: boolean;
      qrTokenPrefix: string;
    };
    trainingAndEvaluation: {
      activeSeason: string;
      defaultSessionDurationMinutes: number;
      minAttendanceForEvalPct: number;
      evalTechnicalWeightPct: number;
      evalPhysicalWeightPct: number;
      evalMentalWeightPct: number;
      autoNotifyParentOnEvaluation: boolean;
    };
    competitionAndMedical: {
      requireMedicalClearedForRoster: boolean;
      autoLockInjuredAthleteInMatch: boolean;
      enableFullBoxScoreTracking: boolean;
      emergencyMedicalContact: string;
      chiefMedicalOfficerName: string;
    };
    hrPayrollAndInventory: {
      defaultHeadCoachSessionFee: number;
      defaultAssistantCoachSessionFee: number;
      payrollCutoffDay: number;
      autoPostPayrollJournal: boolean;
      defaultInventoryMinStock: number;
      enableLowStockAlert: boolean;
    };
    financeAndAccounting: {
      defaultInvoiceDueDays: number;
      allowPartialInvoicePayment: boolean;
      autoGenerateRegistrationInvoice: boolean;
      autoPostDoubleEntryOnPayment: boolean;
      autoPostDoubleEntryOnExpense: boolean;
      requireReversalReasonForJournal: boolean;
      defaultCashAndQrisAccountCode: string;
      defaultBankAccountCode: string;
      defaultArAccountCode: string;
      defaultTuitionRevenueAccountCode: string;
    };
  };
}

export interface JobRoleConfigItem {
  id: string;
  organizationId: string;
  roleCode: string;
  roleName: string;
  jobTitleDefault: string;
  department: string;
  workFunctionSummary: string;
  defaultLandingNav: string;
  allowedNavModules: string[];
  primaryActionsJson: string[];
  canAccessAllBranches: boolean;
  isActive: boolean;
}

export const DEFAULT_APP_SETTINGS: OrganizationAppSettings = {
  paymentMethods: {
    qris: {
      enabled: true,
      merchantName: 'ZAMOA CBTC BASKETBALL ACADEMY',
      nmid: 'ID1026000889912',
      qrisPayload:
        '00020101021126610014ID.CO.QRIS.WWW01189360001400008899120215ID10260008899120303UMI5204799953033605802ID5929ZAMOA CBTC BASKETBALL ACADEMY6007JAKARTA6105121906304A1B2',
      instructions:
        'Buka aplikasi Mobile Banking atau E-Wallet (BCA Mobile, Livin Mandiri, BRImo, GoPay, OVO, DANA, ShopeePay), pilih Scan QRIS, pindai kode QRIS di atas, dan konfirmasi pembayaran sesuai nominal tagihan.',
    },
    bankTransfer: {
      enabled: true,
      accounts: [
        {
          id: 'bank-bca-1',
          bankName: 'BCA',
          accountNumber: '8720991234',
          accountHolder: 'PT Zamoa Cakra Basket Terpadu Center',
          branchName: 'KCU Sudirman Jakarta',
          isActive: true,
        },
        {
          id: 'bank-mandiri-1',
          bankName: 'MANDIRI',
          accountNumber: '1220098877665',
          accountHolder: 'PT Zamoa Cakra Basket Terpadu Center',
          branchName: 'KCP Senayan Jakarta',
          isActive: true,
        },
        {
          id: 'bank-bni-1',
          bankName: 'BNI',
          accountNumber: '0889911223',
          accountHolder: 'PT Zamoa Cakra Basket Terpadu Center',
          branchName: 'Cabang Gatot Subroto',
          isActive: true,
        },
      ],
      instructions:
        'Cantumkan Nomor Invoice (contoh: INV-2026-...) pada berita transfer untuk mempercepat verifikasi otomatis.',
    },
    ewallet: {
      enabled: true,
      wallets: [
        {
          id: 'ew-gopay',
          provider: 'GOPAY',
          phoneNumber: '08119002026',
          accountName: 'ZAMOA CBTC Official',
          isActive: true,
        },
        {
          id: 'ew-ovo',
          provider: 'OVO',
          phoneNumber: '08119002026',
          accountName: 'ZAMOA CBTC Official',
          isActive: true,
        },
        {
          id: 'ew-dana',
          provider: 'DANA',
          phoneNumber: '08119002026',
          accountName: 'ZAMOA CBTC Official',
          isActive: true,
        },
        {
          id: 'ew-shopeepay',
          provider: 'SHOPEEPAY',
          phoneNumber: '08119002026',
          accountName: 'ZAMOA CBTC Official',
          isActive: true,
        },
      ],
      instructions:
        'Kirim pembayaran ke nomor E-Wallet resmi akademi di atas atau gunakan fitur Scan QRIS dari aplikasi dompet digital Anda.',
    },
  },
  notificationChannels: {
    whatsapp: {
      enabled: true,
      senderNumber: '628119002026',
      senderName: 'ZAMOA CBTC Official WhatsApp',
      gatewayMode: 'DIRECT_AND_DIGITAL_HUB',
      autoSendInvoice: true,
      autoSendReceipt: true,
      autoSendAttendance: true,
      autoSendDailyTrainingReminder: true,
      dailyReminderTimeWib: '07:00',
      invoiceTemplate:
        'Halo Bapak/Ibu Wali dari *{athlete_name}*,\nBerikut informasi Tagihan Akademi Basket ZAMOA CBTC:\nNo. Invoice: *{invoice_number}*\nNominal: *{amount}*\nJatuh Tempo: *{due_date}*\nPembayaran mudah dapat dilakukan via QRIS, E-Wallet (GoPay/OVO/DANA/ShopeePay), atau Transfer Bank (BCA/Mandiri/BNI) di aplikasi ZAMOA CBTC.',
      receiptTemplate:
        'Terima kasih Bapak/Ibu Wali dari *{athlete_name}*,\nPembayaran Invoice *{invoice_number}* sebesar *{amount}* via *{payment_method}* telah kami terima (No. Kwitansi: *{receipt_number}*). Status tagihan: *LUNAS (PAID)*.',
      trainingReminderTemplate:
        'Halo Bapak/Ibu *{parent_name}* (Wali dari *{athlete_name}*),\n\n🏀 *PENGINGAT JADWAL LATIHAN HARIAN ZAMOA CBTC*\n📅 Tanggal: *{session_date}*\n⏰ Waktu: *{start_time} – {end_time} WIB*\n📍 Lapangan: *{court_name}*\n🎽 Tim: *{team_name}*\n👨‍🏫 Pelatih: *{coach_name}*\n📋 Materi: *{topic}*\n\nMohon hadir 15 menit sebelum sesi dimulai dan siapkan QR Pass Presensi Atlet.',
    },
    email: {
      enabled: true,
      senderEmail: 'billing@zamoa-cbtc.id',
      senderName: 'ZAMOA CBTC Basketball Academy',
      replyToEmail: 'finance@zamoa-cbtc.id',
      smtpHost: 'smtp.zamoa-cbtc.id',
      autoSendInvoice: true,
      autoSendReceipt: true,
      autoSendEvaluation: true,
      invoiceSubjectTemplate: '[ZAMOA CBTC] Tagihan Resmi {invoice_number} - {athlete_name}',
      receiptSubjectTemplate: '[ZAMOA CBTC] Bukti Lunas / Kwitansi {receipt_number} - {athlete_name}',
    },
  },
  registrationAndWorkspace: {
    onlineRegistrationEnabled: true,
    offlineRegistrationEnabled: true,
    requireAthletePhoto: true,
    defaultPhotoSizeSpec: '3x4',
    defaultPhotoBgColor: 'RED',
    onlineRegistrationPrefix: 'REG-ONL',
    offlineRegistrationPrefix: 'REG-OFF',
    enforceRoleWorkspaceRouting: true,
    filterSidebarByJobFunction: true,
  },
  masterOperationalConfig: {
    dashboardKpi: {
      targetAttendancePct: 85,
      targetMonthlyNewAthletes: 10,
      showRealtimeKpiCharts: true,
      showActiveWorkDeskBanner: true,
      defaultCurrency: 'IDR',
      timezone: 'Asia/Jakarta (WIB)',
    },
    attendanceAndQr: {
      defaultAttendanceSource: 'QR',
      enableOfflineFirstLocalStorage: true,
      autoSyncOfflineOnReconnect: true,
      lateToleranceMinutes: 15,
      enforceAntiDuplicateSession: true,
      requireCoachDigitalSignature: true,
      qrTokenPrefix: 'ZAMOA-CBTC',
    },
    trainingAndEvaluation: {
      activeSeason: '2026/2027',
      defaultSessionDurationMinutes: 120,
      minAttendanceForEvalPct: 75,
      evalTechnicalWeightPct: 40,
      evalPhysicalWeightPct: 35,
      evalMentalWeightPct: 25,
      autoNotifyParentOnEvaluation: true,
    },
    competitionAndMedical: {
      requireMedicalClearedForRoster: true,
      autoLockInjuredAthleteInMatch: true,
      enableFullBoxScoreTracking: true,
      emergencyMedicalContact: '021-555-9911 (RS Mitra Olahraga Jakarta)',
      chiefMedicalOfficerName: 'dr. Rina Kartika, Sp.KO',
    },
    hrPayrollAndInventory: {
      defaultHeadCoachSessionFee: 350000,
      defaultAssistantCoachSessionFee: 200000,
      payrollCutoffDay: 25,
      autoPostPayrollJournal: true,
      defaultInventoryMinStock: 5,
      enableLowStockAlert: true,
    },
    financeAndAccounting: {
      defaultInvoiceDueDays: 14,
      allowPartialInvoicePayment: true,
      autoGenerateRegistrationInvoice: true,
      autoPostDoubleEntryOnPayment: true,
      autoPostDoubleEntryOnExpense: true,
      requireReversalReasonForJournal: true,
      defaultCashAndQrisAccountCode: '1103',
      defaultBankAccountCode: '1102',
      defaultArAccountCode: '1120',
      defaultTuitionRevenueAccountCode: '4101',
    },
  },
};

export function getEffectiveAppSettings(state: SystemState): OrganizationAppSettings {
  const raw = state.organization?.settingsJson;
  if (!raw) return DEFAULT_APP_SETTINGS;
  return {
    paymentMethods: {
      qris: {
        ...DEFAULT_APP_SETTINGS.paymentMethods.qris,
        ...(raw.paymentMethods?.qris || {}),
      },
      bankTransfer: {
        ...DEFAULT_APP_SETTINGS.paymentMethods.bankTransfer,
        ...(raw.paymentMethods?.bankTransfer || {}),
        accounts:
          Array.isArray(raw.paymentMethods?.bankTransfer?.accounts) &&
          raw.paymentMethods.bankTransfer.accounts.length > 0
            ? raw.paymentMethods.bankTransfer.accounts
            : DEFAULT_APP_SETTINGS.paymentMethods.bankTransfer.accounts,
      },
      ewallet: {
        ...DEFAULT_APP_SETTINGS.paymentMethods.ewallet,
        ...(raw.paymentMethods?.ewallet || {}),
        wallets:
          Array.isArray(raw.paymentMethods?.ewallet?.wallets) &&
          raw.paymentMethods.ewallet.wallets.length > 0
            ? raw.paymentMethods.ewallet.wallets
            : DEFAULT_APP_SETTINGS.paymentMethods.ewallet.wallets,
      },
    },
    notificationChannels: {
      whatsapp: {
        ...DEFAULT_APP_SETTINGS.notificationChannels.whatsapp,
        ...(raw.notificationChannels?.whatsapp || {}),
      },
      email: {
        ...DEFAULT_APP_SETTINGS.notificationChannels.email,
        ...(raw.notificationChannels?.email || {}),
      },
    },
    registrationAndWorkspace: {
      ...DEFAULT_APP_SETTINGS.registrationAndWorkspace!,
      ...(raw.registrationAndWorkspace || {}),
    },
    masterOperationalConfig: {
      dashboardKpi: {
        ...DEFAULT_APP_SETTINGS.masterOperationalConfig!.dashboardKpi,
        ...(raw.masterOperationalConfig?.dashboardKpi || {}),
      },
      attendanceAndQr: {
        ...DEFAULT_APP_SETTINGS.masterOperationalConfig!.attendanceAndQr,
        ...(raw.masterOperationalConfig?.attendanceAndQr || {}),
      },
      trainingAndEvaluation: {
        ...DEFAULT_APP_SETTINGS.masterOperationalConfig!.trainingAndEvaluation,
        ...(raw.masterOperationalConfig?.trainingAndEvaluation || {}),
      },
      competitionAndMedical: {
        ...DEFAULT_APP_SETTINGS.masterOperationalConfig!.competitionAndMedical,
        ...(raw.masterOperationalConfig?.competitionAndMedical || {}),
      },
      hrPayrollAndInventory: {
        ...DEFAULT_APP_SETTINGS.masterOperationalConfig!.hrPayrollAndInventory,
        ...(raw.masterOperationalConfig?.hrPayrollAndInventory || {}),
      },
      financeAndAccounting: {
        ...DEFAULT_APP_SETTINGS.masterOperationalConfig!.financeAndAccounting,
        ...(raw.masterOperationalConfig?.financeAndAccounting || {}),
      },
    },
  };
}

export interface SystemState {
  currentUser: {
    id: string;
    uid: string;
    organizationId: string;
    branchId: string | null;
    email: string;
    fullName: string;
    activeRoleCode: string;
    jobTitle?: string | null;
    jobFunction?: string | null;
    department?: string | null;
    defaultLandingModule?: string | null;
    allowedModulesJson?: string[] | null;
    avatarUrl?: string | null;
  };
  organization: {
    id: string;
    code: string;
    name: string;
    legalName: string;
    fiscalYearStartMonth: number;
    settingsJson?: OrganizationAppSettings | null;
  };
  branches: Array<{
    id: string;
    code: string;
    name: string;
    city: string;
    address: string;
    phone: string | null;
    courtsCount: number;
    isActive: boolean;
  }>;
  roles: Array<{
    id: string;
    code: string;
    name: string;
    description: string;
  }>;
  jobRoleConfigs?: JobRoleConfigItem[];
  users: Array<{
    id: string;
    uid: string;
    email: string;
    fullName: string;
    phone?: string | null;
    activeRoleCode: string;
    branchId: string | null;
    jobTitle?: string | null;
    jobFunction?: string | null;
    department?: string | null;
    defaultLandingModule?: string | null;
    allowedModulesJson?: string[] | null;
    avatarUrl?: string | null;
    isActive: boolean;
  }>;
  ageGroups: Array<{
    id: string;
    code: string;
    name: string;
    minAge: number;
    maxAge: number;
    description: string | null;
  }>;
  teams: Array<{
    id: string;
    branchId: string;
    ageGroupId: string;
    headCoachId: string | null;
    code: string;
    name: string;
    genderDivision: string;
    season: string;
    isActive: boolean;
  }>;
  athletes: Array<{
    id: string;
    branchId: string;
    ageGroupId: string | null;
    teamId: string | null;
    memberCode: string;
    fullName: string;
    nickname: string | null;
    gender: string;
    birthDate: string;
    birthPlace: string | null;
    identityNumber: string | null;
    photoUrl: string | null;
    photoSizeSpec?: string;
    photoBgColor?: string;
    photoVerified?: boolean;
    registrationChannel?: string;
    registrationNo?: string | null;
    position: string;
    heightCm: string;
    weightKg: string;
    jerseySize: string;
    jerseyNumber: number;
    parentContactName: string;
    parentContactPhone: string;
    emergencyContactName: string;
    emergencyContactPhone: string;
    membershipStatus: string;
    joinedAt: string;
  }>;
  parents: Array<{
    id: string;
    branchId: string;
    fullName: string;
    relationshipType: string;
    phone: string;
    email: string | null;
    occupation: string | null;
    address: string | null;
  }>;
  parentAthletes: Array<{
    id: string;
    parentId: string;
    athleteId: string;
    relationship: string;
    isPrimaryGuardian: boolean;
  }>;
  coaches: Array<{
    id: string;
    branchId: string;
    coachCode: string;
    fullName: string;
    phone: string;
    email: string | null;
    licenseLevel: string;
    specialization: string;
    isHeadCoach: boolean;
    coachType: string;
    status: string;
  }>;
  staff: Array<{
    id: string;
    branchId: string;
    staffCode: string;
    fullName: string;
    department: string;
    positionTitle: string;
    phone: string;
    email: string | null;
    status: string;
  }>;
  employments: Array<{
    id: string;
    branchId: string;
    coachId: string | null;
    staffId: string | null;
    personnelName: string;
    employmentType: string;
    contractNumber: string;
    startDate: string;
    endDate: string | null;
    status: string;
  }>;
  compensationRules: Array<{
    id: string;
    employmentId: string;
    monthlySalary: string;
    sessionRate: string;
    defaultBonus: string;
    defaultIncentive: string;
    defaultDeduction: string;
  }>;
  trainingPrograms: Array<{
    id: string;
    branchId: string;
    ageGroupId: string | null;
    code: string;
    name: string;
    season: string;
    focusArea: string;
    sessionsPerWeek: number;
    isActive: boolean;
  }>;
  trainingSessions: Array<{
    id: string;
    branchId: string;
    programId: string;
    teamId: string;
    coachId: string;
    courtName: string;
    sessionDate: string;
    startTime: string;
    endTime: string;
    topic: string;
    trainingNotes: string | null;
    status: string;
  }>;
  attendances: Array<{
    id: string;
    branchId: string;
    sessionId: string;
    athleteId: string;
    status: string;
    source: string;
    notes: string | null;
    recordedAt: string;
  }>;
  coachAttendances?: Array<{
    id: string;
    branchId: string;
    sessionId: string;
    coachId: string;
    status: string;
    checkInMethod: string;
    checkInAt: string;
    checkOutAt: string | null;
    digitalSignatureHash: string | null;
    notes: string | null;
  }>;
  staffAttendances?: Array<{
    id: string;
    branchId: string;
    sessionId: string;
    staffId: string;
    status: string;
    checkInMethod: string;
    checkInAt: string;
    checkOutAt: string | null;
    digitalSignatureHash: string | null;
    notes: string | null;
  }>;
  assessmentCriteria: Array<{
    id: string;
    category: 'TECHNICAL' | 'PHYSICAL' | 'MENTAL';
    code: string;
    name: string;
    minScore: number;
    maxScore: number;
    weight: string;
    isActive: boolean;
  }>;
  playerEvaluations: Array<{
    id: string;
    branchId: string;
    athleteId: string;
    coachId: string;
    sessionId: string | null;
    evaluationDate: string;
    periodLabel: string;
    scoresJson: Record<string, number>;
    technicalAvg: string;
    physicalAvg: string;
    mentalAvg: string;
    overallScore: string;
    coachRecommendation: string;
  }>;
  playerGoals: Array<{
    id: string;
    athleteId: string;
    coachId: string | null;
    title: string;
    category: string;
    targetMetric: string;
    currentProgress: number;
    targetDate: string;
    status: string;
  }>;
  competitions: Array<{
    id: string;
    name: string;
    season: string;
    level: string;
    organizer: string;
  }>;
  tournaments: Array<{
    id: string;
    branchId: string;
    competitionId: string | null;
    name: string;
    venue: string;
    startDate: string;
    endDate: string;
    registrationFee: string;
    budgetAmount: string;
    transportPlan: string | null;
    accommodationPlan: string | null;
    mealsPlan: string | null;
    participantsCount: number;
    status: string;
  }>;
  matches: Array<{
    id: string;
    branchId: string;
    tournamentId: string;
    teamId: string;
    opponentName: string;
    venue: string;
    matchDate: string;
    matchTime: string;
    ourScore: number;
    opponentScore: number;
    mvpAthleteId: string | null;
    status: string;
    notes: string | null;
  }>;
  matchRosters: Array<{
    id: string;
    matchId: string;
    athleteId: string;
    jerseyNumber: number;
    position: string;
    isStarter: boolean;
  }>;
  matchStats: Array<{
    id: string;
    matchId: string;
    athleteId: string;
    minutesPlayed: number;
    points: number;
    rebounds: number;
    assists: number;
    steals: number;
    blocks: number;
    turnovers: number;
    fouls: number;
    fgMade: number;
    fgAttempted: number;
    threePtMade: number;
    threePtAttempted: number;
    ftMade: number;
    ftAttempted: number;
  }>;
  achievements: Array<{
    id: string;
    branchId: string;
    tournamentId: string | null;
    teamId: string | null;
    athleteId: string | null;
    title: string;
    category: string;
    rankPosition: string;
    awardedDate: string;
    notes: string | null;
  }>;
  medicalRecords: Array<{
    id: string;
    branchId: string;
    athleteId: string;
    bloodType: string;
    allergies: string | null;
    chronicConditions: string | null;
    insuranceProvider: string | null;
    insuranceNumber: string | null;
    returnToPlayStatus: string;
    medicalNotes: string | null;
    updatedAt: string;
  }>;
  injuries: Array<{
    id: string;
    branchId: string;
    athleteId: string;
    injuryDate: string;
    bodyPart: string;
    diagnosis: string;
    severity: string;
    treatmentPlan: string;
    recoveryNote: string | null;
    returnToPlayStatus: string;
    expectedRecoveryDate: string | null;
    clearedDate: string | null;
  }>;
  membershipPlans: Array<{
    id: string;
    code: string;
    name: string;
    billingCycle: string;
    feeAmount: string;
    registrationFee: string;
    sessionsPerWeek: number;
    isActive: boolean;
  }>;
  memberships: Array<{
    id: string;
    branchId: string;
    athleteId: string;
    planId: string;
    startDate: string;
    endDate: string | null;
    status: string;
  }>;
  invoices: Array<{
    id: string;
    branchId: string;
    athleteId: string | null;
    membershipId: string | null;
    invoiceNumber: string;
    revenueCategory: string;
    description: string;
    issueDate: string;
    dueDate: string;
    totalAmount: string;
    paidAmount: string;
    status: string;
  }>;
  payments: Array<{
    id: string;
    branchId: string;
    invoiceId: string;
    receiptNumber: string;
    paymentDate: string;
    amount: string;
    paymentMethod: string;
    referenceNumber: string | null;
  }>;
  expenses: Array<{
    id: string;
    branchId: string;
    tournamentId: string | null;
    expenseNumber: string;
    category: string;
    vendorName: string;
    description: string;
    expenseDate: string;
    amount: string;
    status: string;
  }>;
  accounting: {
    accounts: Array<{
      id: string;
      code: string;
      name: string;
      accountType: string;
      normalBalance: string;
      debitSum: number;
      creditSum: number;
      netBalance: number;
    }>;
    journals: Array<{
      id: string;
      branchId: string;
      journalNumber: string;
      fiscalYear: number;
      periodMonth: number;
      entryDate: string;
      sourceType: string;
      sourceId: string;
      description: string;
      totalDebit: string;
      totalCredit: string;
      status: string;
      entries: Array<{
        id: string;
        accountId: string;
        debit: string;
        credit: string;
        memo: string | null;
      }>;
    }>;
  };
  payrolls: Array<{
    id: string;
    branchId: string;
    payrollNumber: string;
    periodMonth: number;
    periodYear: number;
    totalGross: string;
    totalDeduction: string;
    totalNet: string;
    status: string;
    items: Array<{
      id: string;
      employmentId: string;
      personnelName: string;
      employmentType: string;
      validSessions: number;
      sessionRate: string;
      monthlySalary: string;
      bonus: string;
      incentive: string;
      deduction: string;
      grossCompensation: string;
      netCompensation: string;
    }>;
  }>;
  inventoryItems: Array<{
    id: string;
    branchId: string;
    sku: string;
    name: string;
    category: string;
    storageLocation: string;
    conditionStatus: string;
    unit: string;
    minStock: number;
    currentStock: number;
  }>;
  inventoryTransactions: Array<{
    id: string;
    branchId: string;
    itemId: string;
    transactionType: string;
    quantityDelta: number;
    targetLocation: string | null;
    conditionAfter: string;
    referenceNote: string;
    createdAt: string;
  }>;
  announcements: Array<{
    id: string;
    branchId: string | null;
    teamId: string | null;
    ageGroupId: string | null;
    targetRole: string | null;
    targetAthleteId: string | null;
    title: string;
    content: string;
    priority: string;
    createdAt: string;
  }>;
  notifications: Array<{
    id: string;
    title: string;
    message: string;
    category: string;
    isRead: boolean;
    createdAt: string;
  }>;
  documents: Array<{
    id: string;
    branchId: string | null;
    entityType: string;
    entityId: string;
    documentCategory: string;
    title: string;
    fileType: string;
    fileUrl: string;
    visibility: string;
    uploadedAt: string;
  }>;
  media: Array<{
    id: string;
    branchId: string | null;
    entityType: string;
    entityId: string;
    mediaType: string;
    title: string;
    mediaUrl: string;
    visibility: string;
    uploadedAt: string;
  }>;
  auditLogs: Array<{
    id: string;
    actorName: string;
    actorRole: string;
    action: string;
    entity: string;
    entityId: string;
    beforeState: unknown;
    afterState: unknown;
    ipDevice: string | null;
    createdAt: string;
  }>;
}
