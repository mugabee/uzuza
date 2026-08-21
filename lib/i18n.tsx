"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

// Section 3.8 pulls Kinyarwanda into v1 scope for the core screens:
// contribute, approve, ledger. Luganda was added alongside it once Uganda
// became a named market, not just Rwanda (CLAUDE.md's East Africa
// expansion). Both are first drafts, not reviewed by a native speaker —
// treat them as a starting point to have checked before relying on them
// for real users, the same way any other unverified content in this app
// gets flagged rather than presented as finished. Everything else (error
// messages from the backend, admin tooling, the internal console) stays
// English for now.

type Language = "en" | "rw" | "lg";

const translations = {
  en: {
    yourContribution: "Your contribution",
    confirmedThankYou: "Confirmed — thank you.",
    amount: "Amount",
    payTo: "Pay to",
    reference: "Reference",
    notSetYet: "Not set yet",
    sendInstructions:
      "Send this exact amount via MoMo, including the reference above if your transfer supports a note. Then submit proof below.",
    previousRejected: "Previous submission rejected",
    pleaseResubmit: "Please resubmit.",
    transactionIdLabel: "MoMo transaction ID / confirmation text",
    screenshotLabel: "Screenshot of payment",
    submitting: "Submitting...",
    submitProof: "Submit proof",
    waitingConfirmation: "Waiting for admin confirmation.",
    markedMissed: "Marked as missed",
    fineApplies: "a fine of",
    rwfApplies: "RWF applies",
    contactAdmin: "Contact an admin.",
    approve: "Approve",
    reject: "Reject",
    confirmReject: "Confirm reject",
    cancel: "Cancel",
    whyRejecting: "Why is this being rejected?",
    viewScreenshot: "View screenshot",
    member: "Member",
    startCycle: "Start Cycle",
    startNextCycle: "Start Next Cycle",
    starting: "Starting...",
    noActiveCycle: "No active cycle",
    paymentDue: "Payment due",
    joinThisGroup: "Join this group",
    joining: "Joining...",
    transactionActivity: "Transaction activity",
    createPledgeList: "Create a pledge list",
    createPledgeListDesc: "Collect money for a wedding, funeral, school fees, or other event",
  },
  rw: {
    yourContribution: "Umusanzu wawe",
    confirmedThankYou: "Byemejwe — murakoze.",
    amount: "Amafaranga",
    payTo: "Ohereza kuri",
    reference: "Inomero y'ubwishyu",
    notSetYet: "Ntiyashyizweho",
    sendInstructions:
      "Ohereza aya mafaranga nyayo ukoresheje MoMo, wongeremo inomero y'ubwishyu hejuru niba ubwishyu bwawe bwemera ubutumwa. Hanyuma wemeze ubwishyu hepfo.",
    previousRejected: "Ubwishyu bwabanjirije bwanze",
    pleaseResubmit: "Nyamuneka ongera wohereze.",
    transactionIdLabel: "Inomero y'ubwishyu bwa MoMo / ubutumwa bw'iyemeza",
    screenshotLabel: "Ifoto y'ubwishyu",
    submitting: "Kohereza...",
    submitProof: "Ohereza ubwishyu",
    waitingConfirmation: "Gutegereza ko umuyobozi yemeza.",
    markedMissed: "Byanditswe nk'ibitarishyuwe",
    fineApplies: "ihazabu ya",
    rwfApplies: "RWF irakenewe",
    contactAdmin: "Vugana n'umuyobozi.",
    approve: "Emeza",
    reject: "Anga",
    confirmReject: "Emeza ukwanga",
    cancel: "Hagarika",
    whyRejecting: "Kubera iki uku kwangwa?",
    viewScreenshot: "Reba ifoto",
    member: "Umunyamuryango",
    startCycle: "Tangira Umuzenguruko",
    startNextCycle: "Tangira Umuzenguruko Ukurikira",
    starting: "Aratangira...",
    noActiveCycle: "Nta muzenguruko ukora",
    paymentDue: "Ubwishyu bukwiye",
    joinThisGroup: "Injira muri iri tsinda",
    joining: "Kwinjira...",
    transactionActivity: "Ibikorwa by'amafaranga",
    createPledgeList: "Tangira gukusanya amafaranga",
    createPledgeListDesc: "Kusanya amafaranga y'ubukwe, gushyingura, amashuri, cyangwa ibindi birori",
  },
  lg: {
    yourContribution: "Ensimbi zo",
    confirmedThankYou: "Zikakasiddwa — weebale.",
    amount: "Omuwendo",
    payTo: "Sasula ku",
    reference: "Ennamba y'okwogera",
    notSetYet: "Tetunnateekebwawo",
    sendInstructions:
      "Weereza omuwendo guno gwennyini nga oyita mu MoMo, ng'oteeka ne ennamba waggulu bwe kiba kisoboka. Oluvannyuma weereza obukakafu wammanga.",
    previousRejected: "Okusaba okwasembayo kwagaanibwa",
    pleaseResubmit: "Weereza nate.",
    transactionIdLabel: "Ennamba y'empapula za MoMo / obubaka bw'okukakasa",
    screenshotLabel: "Ekifaananyi ky'okusasula",
    submitting: "Kiweerezebwa...",
    submitProof: "Weereza obukakafu",
    waitingConfirmation: "Kulindirira omukulembeze okukakasa.",
    markedMissed: "Kiwandiikiddwa nga tekisasuddwa",
    fineApplies: "ekisale kya",
    rwfApplies: "RWF kyetaagisa",
    contactAdmin: "Tuukirira omukulembeze.",
    approve: "Kkiriza",
    reject: "Gaana",
    confirmReject: "Kakasa okugaana",
    cancel: "Sazaamu",
    whyRejecting: "Lwaki kino kigaanibwa?",
    viewScreenshot: "Laba ekifaananyi",
    member: "Omumemba",
    startCycle: "Tandika Omuzingo",
    startNextCycle: "Tandika Omuzingo Oguddako",
    starting: "Kitandika...",
    noActiveCycle: "Tewali muzingo gukola",
    paymentDue: "Okusasula okusuubirwa",
    joinThisGroup: "Yingira mu kibiina kino",
    joining: "Kuyingira...",
    transactionActivity: "Ebikolwa by'ensimbi",
    createPledgeList: "Tandika okukuŋŋaanya ssente",
    createPledgeListDesc: "Kuŋŋaanya ssente ez'obugole, okuziika, essomero, oba ekivvulu ekirala",
  },
} as const;

type TranslationKey = keyof typeof translations.en;

const LanguageContext = createContext<{
  language: Language;
  setLanguage: (l: Language) => void;
  t: (key: TranslationKey) => string;
} | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>("en");

  useEffect(() => {
    const saved = localStorage.getItem("uzuza_language");
    if (saved === "rw" || saved === "en" || saved === "lg") setLanguageState(saved);
  }, []);

  function setLanguage(l: Language) {
    setLanguageState(l);
    localStorage.setItem("uzuza_language", l);
  }

  function t(key: TranslationKey) {
    return translations[language][key];
  }

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
