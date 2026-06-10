const CORE_FOLDERS = ['Plan', 'Data', 'Thesis', 'References'];

function parseLeadingDate(filename) {
  const match = filename.match(/^(\d{2}|\d{4})[.\-_\s]?(\d{2})[.\-_\s]?(\d{2})/);
  if (!match) return null;

  const rawYear = match[1];
  const year = rawYear.length === 2
    ? (Number(rawYear) >= 80 ? 1900 + Number(rawYear) : 2000 + Number(rawYear))
    : Number(rawYear);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  return `${year.toString().padStart(4, '0')}-${match[2]}-${match[3]}`;
}

function normalizeFile(file) {
  const name = typeof file === 'string' ? file : file.name;
  return {
    ...(typeof file === 'string' ? {} : file),
    name,
    filenameDate: parseLeadingDate(name)
  };
}

function fileExtension(filename) {
  const dotIndex = filename.lastIndexOf('.');
  return dotIndex >= 0 ? filename.slice(dotIndex + 1).toLowerCase() : '';
}

function extensionPriority(filename, preferredExtensions) {
  const index = preferredExtensions.indexOf(fileExtension(filename));
  return index >= 0 ? index : preferredExtensions.length;
}

function latestByFilenameDate(files, preferredExtensions = []) {
  return files
    .map(normalizeFile)
    .filter((file) => file.filenameDate)
    .sort((left, right) => {
      const dateOrder = right.filenameDate.localeCompare(left.filenameDate);
      if (dateOrder !== 0) return dateOrder;
      return extensionPriority(left.name, preferredExtensions) - extensionPriority(right.name, preferredExtensions);
    })[0] ?? null;
}

const activeProjects = [
  { title: 'SCI BBB Ladder AI', driveFolderId: '1Mee5iTLEoXGm2IjLfcUP5debx_Rwfnwt', status: 'ready_to_write', priority: 'A', potential: 'High', type: 'ai_ml', thesisCount: 1, figures: true, targetJournal: 'Nature Biomedical Engineering / Advanced Science' },
  { title: '인하대 Laminin', driveFolderId: '1Q667o7ZZA1FTEm3fwe8z3pwlU6kSwaiP' },
  { title: 'Wireless Electrical Stim', driveFolderId: '1H8kKtq5AkqovMVbrMmtb3LWbT5EUpc57' },
  { title: 'Violin Motion analysis', driveFolderId: '1yRDlRtPi40e-OzktLqap6yE-zd_K3fVI' },
  { title: 'Transgenic rats', driveFolderId: '1TnpJKJtwtvGDi4Wwvhix_MHXmEGic3CY' },
  { title: 'Tissue_Clearing', driveFolderId: '1HSv81YcuTHBzJKYy06gcypJ4NaKpgrVg' },
  { title: 'TBI POM', driveFolderId: '18S5o_W-eb-DphrwX6Y5-VO4eGrWds3iJ' },
  { title: 'TBI model_Setup', driveFolderId: '1shmqWnJXPMC6xaD2Ndl9T0cbUwwp6sVo' },
  { title: 'TBI model_Elect Stimul', driveFolderId: '16Ey82q4I74DTFADdzXliDuXqrEZQQtRi' },
  { title: 'TBI model macrophages', driveFolderId: '1PY8sT-_UrJf8xPD6u9GKb5wozRZRjkoz' },
  { title: 'TBI model CONP', driveFolderId: '1XVtnVFsstNAhNa656_M2sG80wh-tKOtb' },
  { title: 'TBI mitochondria', driveFolderId: '1fgtm6Zv66Gr9nEapLXr5B3Wa8zzds9C4' },
  { title: 'TBI exosome', driveFolderId: '1mnqKj3sLlLlr8e5WTIlQgeR50kukIcfv' },
  { title: 'TBI CNT scaffold rNSCs', driveFolderId: '1CdHRdDohgvt86Xw5-hSrBxPGI6uVyDv9' },
  { title: 'Stroke In vivo reprogramming Dongguk', driveFolderId: '1d6vxNrwUoxUo40-azugXurNX00TgsKoA' },
  { title: 'SCI_Review_Mech', driveFolderId: '1mK2WQlqk8eDU1Ls3e7cKkIaCq2hY7wQy', type: 'review' },
  { title: 'SCI_Hydrogen', driveFolderId: '1wc-_Fe48yDXJ4v-BYON44rFzXSfxqa1o' },
  { title: 'Sciatic Scaffold_SCs', driveFolderId: '1jmcl3B-LTcY1gMhhtV8Xcv-kJqqf0Vm4' },
  { title: 'Sciatic 3DP stim SNU', driveFolderId: '1aeN_GorOuTTkh5y5TrDjf39Ickigy7t0' },
  { title: 'SCI tSCS', driveFolderId: '1-zJBVblc_tpEkpjvtvBwEKMoFdN78NcE', status: 'ready_to_write', priority: 'A', potential: 'High', thesisCount: 1 },
  { title: 'SCI Trophoelastin Sydney', driveFolderId: '1pKRdk3RnFa5Vyd_3gDGxDvwM5jTOouuw' },
  { title: 'SCI Transgenic_CRISPR', driveFolderId: '1I2Fabyqg2devkZGs6MWbZIRhH7IKCIwR' },
  { title: 'SCI Tracing', driveFolderId: '1VOQL5G88gibLdSgcIiVxenID-2M2F32D' },
  { title: 'SCI Stem_Cell_Survey', driveFolderId: '16NAq6wFm8oXvdDescNeZQBAzjDrewtw7' },
  { title: 'SCI Stem Cell Pts Phx', driveFolderId: '17i5kuowAEqByS2Dd3Pejnhx6MXrf0Mx5', priority: 'A', potential: 'High', type: 'clinical' },
  { title: 'SCI Sirt NAD', driveFolderId: '1yvNEIex_A8GAuFD8Jm2xL_bFeUWQWi2X' },
  { title: 'SCI Single cell analysis', driveFolderId: '1Ulkr7sdHGQrlTfjg_RPfKV2aH12OGpAP', status: 'ready_to_write', priority: 'A', potential: 'High', thesisCount: 1, targetJournal: 'Nature Communications / Advanced Science' },
  { title: 'SCI Sciatic GFRa1_Hokkaido Univ', driveFolderId: '1uGYw3Cp1f3k_HZlpHPf0Tcelvg7i2Rq_' },
  { title: 'SCI Schwann cell scaffold', driveFolderId: '1Xr_yQh7JxMyp7Yd0tQ5pjRpLDsv8Fb9E' },
  { title: 'SCI scaffold KIST', driveFolderId: '1ZwzH5BE9bjUFJc2KTj0A6_3WsM56tp9B' },
  { title: 'SCI Robots', driveFolderId: '195cDvnLa8UDwDo85x2iy-6rkYInKa-4r' },
  { title: 'SCI Resp recovery', driveFolderId: '1J17z4KR3m4atpa5Q1umDfgte03WBxxiI' },
  { title: 'SCI Pts Mx', driveFolderId: '1TRvc_FfaccUKRl0K874OQxo23dfBYILa', type: 'clinical' },
  { title: 'SCI Porcine_Hydrogel_Ajou', driveFolderId: '1Efmb9w4cIVfoQgFZVgkVRaIEha7EOzT5', status: 'ready_to_write', priority: 'A', potential: 'High', thesisCount: 1, targetJournal: 'Advanced Healthcare Materials / Biomaterials' },
  { title: 'SCI Porcine contusion', driveFolderId: '1Znn1vEMVy34V39nwLHe2DYH4mSGkwDmQ', priority: 'A', potential: 'High' },
  { title: 'SCI POM ITREN', driveFolderId: '1LWAIFXe4D09m5m0mdLJHiHWdWmXhqPry' },
  { title: 'SCI Plasticity', driveFolderId: '1jmqZCOYzBijNJBDUgfypPlkpdZ6g9N_b' },
  { title: 'SCI PD88 particles', driveFolderId: '1j_cBOihxglj4FN2WHcb4v7fxzUL6RpJ7' },
  { title: 'SCI NMDA antagonists', driveFolderId: '1qVwPGIpXbH0XVd584Vv7ApldnhqrtFCy' },
  { title: 'SCI New Electrode SNU Kang', driveFolderId: '10VYX4vDylgBrLxIPQHWiLPEZfhtCDi4l', status: 'ready_to_write', priority: 'A', potential: 'High', thesisCount: 1 },
  { title: 'SCI Mol Works', driveFolderId: '1eT0sDKvUXMBl9kjfGn7QmtJ8bOCClkt1' },
  { title: 'SCI model tracing', driveFolderId: '1jo3u5HR3JK3sCBLZU615tjwRGxiBMhos' },
  { title: 'SCI Mitochondria_Tf', driveFolderId: '1OwVT3C5e5y5mTfh0YK1CeUwlfihqpqqR' },
  { title: 'SCI Microbiome', driveFolderId: '1DeJH1bxDHylqSgTMPCfqUM_XUHEi6318' },
  { title: 'SCI Macrophage polarization', driveFolderId: '1QU4nA2sfJ-ZT-diUtS3rsIrSsc-hG3w7' },
  { title: 'SCI iOPCs', driveFolderId: '1M5XKKc6uYCWTCHpHyD7twCWAa1QUyJn9' },
  { title: 'SCI Inflammation_Root_avulsion_Son', driveFolderId: '1WJZBCAJmMh5goxa1EUrxNbt-qMODoGMO' },
  { title: 'SCI iN', driveFolderId: '1JqrVEaui2Xo5LmQJXCmqwxSA8mjGOSzE' },
  { title: 'SCI Hypothermia', driveFolderId: '19n_XN9_Pp3ZURSU3JsjMPh4aQpZDqArZ' },
  { title: 'SCI Gene Tx', driveFolderId: '1iWrV9PVjgtJyMUgLq07NNucTAGyzCx3-' },
  { title: 'SCI Exosome ITREN', driveFolderId: '1pmcAIqYPLLFGO0W-AxClCsQQp3Z7sK7I' },
  { title: 'SCI ex vivo test', driveFolderId: '1EHmJsEV_qbbhpbi85-J_sr-705MfYW9W' },
  { title: 'SCI ES Purdue', driveFolderId: '1lUtBWfKhPtMigeiX5_bYVFPNqRaOS-NZ' },
  { title: 'SCI ES_KAIST STEAM', driveFolderId: '1lgbOlXSzZwaG0Ef8UrJ9SsKKHJRlifdV' },
  { title: 'SCI Epigenetics', driveFolderId: '1LyJfsf6BjSle5vbB9ly-zgrVAaqECcD4' },
  { title: 'SCI endegenous NSC', driveFolderId: '1qH6frI3068Br3Ro2U759Sj1clnde3I-z' },
  { title: 'SCI Electrical Stim SNU', driveFolderId: '1vhGM0ukJKSFVOfkBb9NwXd2Xjj8aYQy9' },
  { title: 'SCI DTI_3T', driveFolderId: '1x6IZu3jY73uStqnWrcDLWkPoGdqf2MkI', type: 'clinical' },
  { title: 'SCI Drug screening', driveFolderId: '1l95FbKmqRyYzB3SPhwxxQL1GMfcfl8bZ' },
  { title: 'SCI Drug RNA seq', driveFolderId: '1rqN04Kn3o-YKe45-JnI7UP__gAxT0TZ7' },
  { title: 'SCI DLZK', driveFolderId: '1RL8ABZxvQbcgGq7mft36o_7s9HzYHiFP' },
  { title: 'SCI Diaphragm Stim', driveFolderId: '18VPRa3gtqA7tldBdwsvzNbv1RIAwEqwp' },
  { title: 'SCI Decubitus Ulcer Prev KRISS', driveFolderId: '1trmnLfdDxAy2LWWcE7vSrsjrJXTuY9hw' },
  { title: 'SCI DAMP scavenger', driveFolderId: '16UvW05J16CXSS2WUJBRkoPZyF02L9WYq' },
  { title: 'SCI collagen 1 fibroblasts', driveFolderId: '177NHz38KCQnmQ-r9ULqUVcitU-6ga6Bv' },
  { title: 'SCI CNP PAMAM', driveFolderId: '1jfsYPjeEL0_9DeVGKshBezewBSfiO2Cm' },
  { title: 'SCI Chronic', driveFolderId: '1XwopWmORUpyXLuITyU1f1wsuubGsMYUJ' },
  { title: 'SCI CeNW_Sheet', driveFolderId: '1JYS2ngGEYKoW4Ejbjz7I3luq5wW7f6T_' },
  { title: 'SCI CeNP M2', driveFolderId: '15euAsnw-lMl46UJDCqMBNyk30XJV-uIt' },
  { title: 'SCI CeNanowire_rod', driveFolderId: '1_16zvQXiDOqyt2HyV_yFfnfLwXJ8nq9d' },
  { title: 'SCI CeMSI', driveFolderId: '1XwSajHWV0WeRzzNoL7GX5FeoKqt_VVi5' },
  { title: 'SCI Brain dECM', driveFolderId: '1s-OZlBXMe5uJLiX5A52aEKZ7BtxwRcOx' },
  { title: 'SCI Benzotropine', driveFolderId: '1ydR8EDR4OBU4EsgWhan6RNv9phgpaNN-' },
  { title: 'SCI Angiogenesis', driveFolderId: '1HBUSh3FwKsDdiscA_R-4aODw_LnfsX7_' },
  { title: 'SCI acute pts DTI', driveFolderId: '1GcidfD9YyXu35Nf0vDmbXotROf3ix9l_', type: 'clinical' },
  {
    title: 'Scaffold_transection models',
    driveFolderId: '16QrzLyA0VzALvAsmcb9hA7bkFysxu6Wq',
    status: 'ready_to_write',
    priority: 'A',
    potential: 'High',
    thesisCount: 40,
    dataCount: 1,
    figures: true,
    targetJournal: 'Advanced Science / Biomaterials',
    structureNote: '비표준 구조: root 아래 Thesis, Sciatic transection scaffold, SCI transection scaffold, In vitro가 병렬로 존재합니다. Thesis 폴더는 직접 확인된 원고 저장소입니다.',
    thesisFiles: [
      { name: '241029 SCI Sciatic scaffold Hyun.docx', driveFileId: '1memhydKyEZwq5oSZHNACEQv3hZkDTXkM' },
      { name: '241029 SCI Sciatic scaffold Hyun.doc', driveFileId: '1yAcy6Upb5PaBvawnpsKhWhaBYe71ECZW' },
      { name: '240621 SCI Sciatic scaffold Hyun.docx', driveFileId: '17Bnvp7-vDyoMcrBGF-Pi3xKrUDg2iu8K' },
      { name: '240404 SCI Sciatic scaffold Hyun.docx', driveFileId: '1raXbFMls5NujePqk4oKE0CNFtPMahxF2' },
      { name: '240228 SCI Sciatic scaffold Hyun.docx', driveFileId: '1aUK6vBqR88odB1jlRMcTCV0nSE2K8975' },
      { name: '240115 SCI Sciatic scaffold Hyun.docx', driveFileId: '1-2aJWEGzApuwJO8jPW0g-DlD_opWWLRE' },
      { name: '231229 SCI Sciatic scaffold Hyun.docx', driveFileId: '1_BgxRMFtqRZoPjIp-SeE6JPVIUp4kGAV' },
      { name: '231123 Thesis SCI scaffold Hyun.docx', driveFileId: '1VMpyDLhQJpwvVVbCXZ2XX7CK-xVEeXFQ' }
    ],
    dataFiles: [
      { name: '240214_Master_file.xlsx', driveFileId: '1hn_ql61Nw8UzyoR_vLfk2lQQy6RNDjiw' }
    ]
  },
  { title: 'Scaffold_Next Gen', driveFolderId: '1O-rnMTcRc5slfxPxY1S1-oO8eT8QxzrG' },
  { title: 'Scaffold_KIST', driveFolderId: '1anL9_RTcQ7pjA_ya3U3O53rDttaF4tCj' },
  { title: 'Sarcopenia_Reboxetine', driveFolderId: '1WrB24E1OaP8r280oUgo3PmOsy8y3ez6k' },
  { title: 'Sarcopenia_NNMT inhibitor', driveFolderId: '1i631CLSuRdygUNpqVJS8oLyavq0qMig4' },
  { title: 'Sarcopenia_FTI drugs', driveFolderId: '1EUQMXnHnK4JwlUcp-XPRP3Cc6fBuw7-3' },
  { title: 'Sarcopenia_Digital Tx', driveFolderId: '1BEOIPUEpfyZv46ttPIHtFeruYb_-dVAn', status: 'ready_to_write', priority: 'A', potential: 'High', thesisCount: 1 },
  { title: 'Sarcopenia Target Drugs', driveFolderId: '1JHYt0SdPZ7La48IdONsrMlM0mfoRoWVr' },
  { title: 'Sarcopenia Drug Screening', driveFolderId: '1BEvi7alAYrYqXVi86OcKBSr91uIAvFsj', status: 'ready_to_write', priority: 'A', potential: 'High', thesisCount: 1, targetJournal: 'Aging Cell / Journal of Cachexia, Sarcopenia and Muscle' },
  { title: 'Review_SCI Epigenetics JTE', driveFolderId: '1IatrthvIfrV08wHesQhQ8AjRinCzDtIO', type: 'review' },
  { title: 'Review_Pain Violin', driveFolderId: '12Jk22tc-q0a7nWlj0VAoeqjDJs9dNXJ9', type: 'review', priority: 'B', potential: 'Medium' },
  { title: 'Precision Medicine_Future', driveFolderId: '12xj9B2gE56tSzsmzjcpnxsFHr3NaFtrf' },
  { title: 'Personalized Medicine', driveFolderId: '1l7X7DqXFTaGc5IlBsV6lxmUsovZOCOSQ' },
  { title: 'Peripheral_Electrical Stim', driveFolderId: '1gMVwJ1sTWGAIssW36jTYNF7wHoad6r9S' },
  { title: 'Patch clamp', driveFolderId: '1MSPutB_SOFZj1pOcP9bEJbimXyLZAe2d' },
  { title: 'Organoid CNS', driveFolderId: '1r24L3CXHNtDUkLE99pPDA7XQPCm02Yl-' },
  { title: 'Optogenetics', driveFolderId: '1DnbLmnMipEziZKjQ1cNdF6VZGYkZn_fE' },
  { title: 'NTFs_Screening', driveFolderId: '1RmOLLYcg5XsGyvHXT0l5XoHcD4Il-cnN' },
  { title: 'Nanowire_ROS_NSC', driveFolderId: '1rpp7P7mVwMDzU0lKuYk2jUZbbmebLnzj' },
  { title: 'NAD_Effects', driveFolderId: '1vaZvCa6kTCyrnpzfuv5ITjM1DHPUyRzM' },
  { title: 'Music Plasticity Epigenetics', driveFolderId: '1HvDcAhxsE-ay20M-h2TYNHcnFOUxbCh2' },
  { title: 'Muscle staining', driveFolderId: '1SsOdFvdrLRI4gOARKkDfnUmLfo5T4Ehp' },
  { title: 'mRNA Nanosensor', driveFolderId: '1k_HZxovgD5Q96xaefx48toNz-LZVuhWN' },
  { title: 'Microfluidics', driveFolderId: '1Dvh9vMAb1OXBW2ZlUkyhdaW04c8L54BU' },
  { title: 'MEP SEP', driveFolderId: '14BvWZY10cod07DUdOWqVYmYwY-3rB0Jq', type: 'clinical' },
  { title: 'Clinical 원예치료_희주', driveFolderId: '11wLtgcCZe9LUpa2r4SRqNxVdmh-McQR8', type: 'clinical' },
  { title: 'Clinical TBI seizure prediction ETRI', driveFolderId: '1e6hIFlxZI6DtQc3a9f5CqvOIihk5-NWY', type: 'ai_ml', status: 'ready_to_write', priority: 'B', potential: 'High', thesisCount: 1 },
  { title: 'Clinical TBI MCS Recovery ETRI', driveFolderId: '1LJ7-bIYSUVQhU110TdxRgY682PKiRGBx', type: 'clinical' },
  { title: 'Clinical SCI_pain_rTMS', driveFolderId: '1x4XjLj8UsiUokLau_M1AbsG2kGXO3eh6', type: 'clinical' },
  { title: 'Clinical SCI DTI rTMS', driveFolderId: '1-BY8g_3M1iESJrRYzNXR-UMDMqjNf9BW', type: 'clinical', status: 'ready_to_write', priority: 'A', potential: 'High', thesisCount: 1, targetJournal: 'Neurorehabilitation and Neural Repair / Brain Stimulation' },
  { title: 'Clinical Sarcopenia Exercise App', driveFolderId: '1T-Mk6fmOtvPkzrdOmiw0bIMwLBqUx4Og', type: 'clinical' },
  { title: 'Clinical Sarcopenia Digital Tx', driveFolderId: '1z8s7d2ZXlobZZI85Uxg03G8jJ572YnHC', type: 'clinical' },
  { title: 'Clinical Robot_Hip', driveFolderId: '1rrtm7yZIGnSzS4WZxUvcFZY5qZ2KRQ6h', type: 'clinical' },
  { title: 'Clinical PTSD prediction Px Tx', driveFolderId: '1iWxV9XEPReECU-xX-gK3uzMxHjk8dUKk', type: 'ai_ml' },
  { title: 'Clinical Prediction App', driveFolderId: '1U11EJg39nFDfQdEgPaeB7egPtoBbVdYH', type: 'ai_ml' },
  { title: 'Clinical ML Stroke Prediction', driveFolderId: '10lIeOTijXNI5G90MbTauShc98g3YybSs', type: 'ai_ml', status: 'ready_to_write', priority: 'A', potential: 'High', thesisCount: 1 },
  { title: 'Clinical Hybrid Prosthesis EEG EMG', driveFolderId: '1AKbeRGzXRelOYpUIHdCmtYX9tjO8N_Nj', type: 'clinical' },
  { title: 'Clinical Helicopter_Trauma_KC', driveFolderId: '1f9gq2NAWlhA6m4Y7BxfvU7Qq0YpMWIKG', type: 'clinical' },
  {
    title: 'Clinical Exp SCI Gabapentinoid',
    driveFolderId: '1LYx07m2mWLXxVZTrL3PTatx-2GaZ34zz',
    type: 'clinical',
    status: 'ready_to_write',
    priority: 'A',
    potential: 'High',
    thesisCount: 5,
    dataCount: 47,
    figures: true,
    targetJournal: 'Spinal Cord / Journal of Neurotrauma',
    thesisFiles: [
      { name: '241220 Clinical Exp SCI Gabapentinoids Hyun.pdf', driveFileId: '1RmqZWhQvbL8R-XgI0-6TNIZ_XRU9baXd' },
      { name: '241220 Clinical Exp SCI Gabapentinoids Hyun.docx', driveFileId: '1ohBrfVAT0kYdWEMjQ_CvEENoaUbGunD4' },
      { name: '240110 Clinical Exp SCI Gabapentinoids Hyun.docx', driveFileId: '1_I5mzVLLrJ77NexDF9pTv6B5TjWN_HKZ' },
      { name: '171014 Clinical SCI Gabapentinoids Hyun.docx', driveFileId: '1sfkLxwn-1LW6sMVJiUUvn2jj5-UbNUO4' },
      { name: '170706 The Clinical Effects of the Gabapentinoids in Spinal cord injury_final.docx', driveFileId: '1jKjS44r3l_PbfDKp6vwqiDcaYwAfzWVp' }
    ],
    dataFiles: [
      { name: '251107 PGB BBB_25.11.07 김다빈 .xlsx', driveFileId: '1CqO_TlEDgfEyI6CUFj5w86u_OKcO2Hyy' },
      { name: '250929 PGB BBB_25.09.29 김다빈.xlsx', driveFileId: '1N6oaYMpFn_fdmjVS1j5W06S3jsLG-Jcn' },
      { name: '250811 PGB BBB_25.08.11 김다빈 .xlsx', driveFileId: '1wAoasXCHPfHt9Vld8H9TQup50YwE0lit' },
      { name: '250519 PGB BBB_25.05.19 김다빈.xlsx', driveFileId: '1VRLZWTWsmbLpdmjkGpehCGURITrnNH_l' },
      { name: '250512 PGB BBB_25.05.12 김다빈.xlsx', driveFileId: '1vAqePILeRiKzN12nNHXE236X_KBRnkM_' },
      { name: '250428 PGB BBB_25.04.28 김다빈.xlsx', driveFileId: '18fqQCxYvLIBHqndUL9j8-Vm5bT09BvM9' },
      { name: '220511_PGB_invivostudy_BBB.xlsb.xlsx', driveFileId: '1Op-UEiJhnNISAnhKOGO68uKAP_KaE5w2' },
      { name: '181110 SCI_gabapentinoid_raw.xlsx', driveFileId: '1_L2sDbQHZWfM7P3CpL2PwlUBz3M-iBfy' },
      { name: '180419 gabapentinoid_raw data_Hyun.sav', driveFileId: '1vYzRmZImhKXljqwFnS-RyW8T9Lo7Ixgl' }
    ],
    referenceBenchmarks: [
      {
        sourceType: 'Key journal',
        title: 'Warner Early administration of gabapentinoids improves motor recovery after human SCI',
        journal: 'Cell Reports',
        year: '2017',
        url: 'https://www.sciencedirect.com/science/article/pii/S2211124717301031',
        driveUrl: 'https://drive.google.com/file/d/1hvZbc5wsZZP9GlPoBijbg3V0OYJmDgec/view',
        methodSignal: 'Human SCI cohort, timing of gabapentinoid exposure, motor recovery endpoint.',
        gapCheck: '원고의 primary outcome, exposure timing, adjustment variables가 high-impact clinical neuroscience paper 수준으로 정리됐는지 확인.'
      },
      {
        sourceType: 'Key journal',
        title: 'Warner Association of gabapentinoid timing with motor recovery in SCI',
        journal: 'Neurology',
        year: '2020',
        url: 'https://www.neurology.org/doi/10.1212/WNL.0000000000010950',
        driveUrl: 'https://drive.google.com/file/d/1-xSdcmg28YRG0hwUg1UhwHftlmKkP2bU/view',
        methodSignal: 'Timing-sensitive clinical analysis and neurological recovery outcome framing.',
        gapCheck: 'Gabapentinoid 투여 시점, follow-up window, confounder 처리, sensitivity analysis 필요성을 대조.'
      },
      {
        sourceType: 'Guideline / protocol',
        title: 'Wilson Gabapentinoid SCI protocol',
        journal: 'Frontiers in Neurology',
        year: '2022',
        url: 'https://www.frontiersin.org/journals/neurology/articles/10.3389/fneur.2022.1033386/full',
        driveUrl: 'https://drive.google.com/file/d/1uZI7WkoIpom1kzbZzy01F3c4lDI54A5W/view',
        methodSignal: 'Protocol-level PICO, inclusion/exclusion logic, planned outcomes.',
        gapCheck: '본 원고의 study design과 reporting structure가 protocol/guideline 수준으로 명확한지 확인.'
      },
      {
        sourceType: 'High-impact mechanism',
        title: 'Tedeschi Ca channel subunit alpha2delta2 axon regeneration in adult CNS',
        journal: 'Neuron',
        year: '2016',
        url: 'https://pubmed.ncbi.nlm.nih.gov/27720483/',
        driveUrl: 'https://drive.google.com/file/d/1d9wAD6i6Clx_QOcRH3jGNeqi7YpvG3EO/view',
        methodSignal: 'Mechanistic rationale for alpha2delta2/gabapentinoid biology and axon regeneration.',
        gapCheck: 'Discussion에서 임상 결과와 biological plausibility를 연결하는 근거로 충분히 반영됐는지 확인.'
      },
      {
        sourceType: 'Statistics guideline',
        title: 'Fawcett ICCP statistical power guideline for SCI clinical trials',
        journal: 'Spinal Cord',
        year: '2007',
        url: 'https://www.nature.com/articles/3102007',
        driveUrl: 'https://drive.google.com/file/d/1unQ60O6eHVO5-s5RjlAn87CSLbvR0nb3/view',
        methodSignal: 'SCI clinical trial statistics, power, endpoint interpretation.',
        gapCheck: 'Sample size, endpoint choice, statistical power, limitation 문구가 SCI 임상연구 기준에 맞는지 확인.'
      },
      {
        sourceType: 'Latest high-impact benchmark',
        title: 'Closed-loop vagus nerve stimulation aids recovery from spinal cord injury',
        journal: 'Nature',
        year: '2025',
        url: 'https://www.nature.com/articles/s41586-025-09028-5',
        methodSignal: 'Prospective, double-blinded, sham-controlled randomized SCI recovery study with clinically meaningful functional endpoints.',
        gapCheck: '최신 high-impact SCI 임상논문 수준으로 blinding, sham control, endpoint hierarchy, effect size, CONSORT figure, limitation을 비교.'
      },
      {
        sourceType: 'Latest scan',
        title: 'PubMed live search: SCI gabapentinoid motor recovery',
        journal: 'PubMed',
        year: 'live',
        url: 'https://pubmed.ncbi.nlm.nih.gov/?term=spinal+cord+injury+gabapentinoid+motor+recovery&sort=date',
        methodSignal: '최신 논문과 high-impact follow-up paper를 확인하는 라이브 검색 링크.',
        gapCheck: '새로운 endpoint, competing claim, 최신 분석법 또는 reviewer가 지적할 novelty conflict를 정기 확인.'
      }
    ]
  },
  { title: 'Clinical DTI SCI AI', driveFolderId: '1CZGMhFcBMW9se75opsDje8gaWELc_Z2K', type: 'ai_ml' },
  { title: 'Clinical DTI Pre Post FU', driveFolderId: '1TfDVQncspPe1oUrNnxOqmKl6oWJBehLB', type: 'clinical' },
  { title: 'Clinical AI', driveFolderId: '10xoExRn5hnjkoB8O-ZPDHi6YnQ9orfVh', type: 'ai_ml' },
  { title: 'Clinical Brain Amantadine', driveFolderId: '1Ac4d5_tsE2ML-i6oYujj5Qb0znAimT0r', type: 'clinical' },
  { title: 'Caloric restriction M2', driveFolderId: '1QhKb9mRiSukg9dTNyh_wS--XNgzleybK' },
  { title: 'Brain_Pressure Sensor_KU', driveFolderId: '1seoUMyL5Xki6Nafou0LHx8jya9xd1074' },
  { title: 'Brain_Injectable Sensor', driveFolderId: '1FnLjzpqUWwqXFIn9PQ1EyFfmsINfaSnN' },
  { title: 'Brain mapping', driveFolderId: '1-zqrMTE2fsnV1QKgPqRT1aFsW_507JTy' },
  { title: 'Brain Inject Electrode SNU', driveFolderId: '14e-8hdqVgSKhdDgE5Pk0ihcexxXc8a0w' },
  { title: 'Bladder_ES', driveFolderId: '1JKDfzqu77MzYe_UxM9LdAClJAjExGU9I' },
  { title: 'Biobattery', driveFolderId: '145e6PPHZ561Q_fzAOnKFJHukx6vO1ihs' },
  { title: 'BBB Open', driveFolderId: '1bNzVS94DyaYMpaxsddMqgf_o9rtxlc5z' },
  { title: 'Axonal transport_Gipi UCL', driveFolderId: '1pPz7WM2cBu9xyVQ07G0u7I01BfueRgY_' },
  { title: 'Autonomous Lab', driveFolderId: '19DRtsgdwEvbwVbPJiZOVrg1DWns52S2u' },
  { title: 'Artificial Intelligence', driveFolderId: '1_HktN0svzGhtipV-oMoytWUbhsd6dTuQ', type: 'ai_ml' },
  { title: 'Animal models', driveFolderId: '14TnPmXg5XwXX0-XyFbPUMNnS5ZuHmOva' },
  { title: 'AlphaFold_Drug', driveFolderId: '1lDgnT9t36FwyEn2eRWZPSseWdKxYIDpm', type: 'ai_ml' },
  { title: 'Adiponectin_neurogenesis', driveFolderId: '1NHUkLEBCkKXNs20yq1mqrmRcx8jTwUeC' },
  { title: 'CuO NP_SCI TBI', driveFolderId: '1o-CV3-ciAKUo9Hiha-uKHd376yiM9xO2' },
  { title: 'Brain Remap SCI', driveFolderId: '1Mu4j7OTrtPlyhbAWwyaxLsMBFEC6B0sL' },
  { title: '2014iOPC_SCI_In vivo Hyun', driveFolderId: '1TinIcOSuvOTvhEUd1OX4ZOWlnzle2ume' },
  { title: 'Review Clinical trial stem cell SCI', driveFolderId: '1WwHEDjqN9dC3bZjFnDFoeh6HCjqvuzzy', type: 'review' },
  { title: 'Review Func Smart biomaterials Regn Med Front Bioeng Biotech', driveFolderId: '1DgeWw2xwodBP4HfTvDkVcXNUAbdQUzjj', type: 'review' },
  { title: 'SCI Smart Biomaterials Front Bioeng Biotech review', driveFolderId: '15wsfqHzB6QBmzYJCfIVj4Op7vGhb4rlL', type: 'review' },
  { title: 'SCI in vivo reprogramming Dongguk', driveFolderId: '1tTcymFEFpcf3k4LqkPgupVPBJGUgZtBE' },
  { title: 'Sciatic scaffold KNU', driveFolderId: '18cAgYt1sJzOy9BIx_3keVUwNLPJmTvGu' },
  { title: 'Sciafic Grephene_PCL Scaffold', driveFolderId: '1738rcNPvAGXxvOLXzVyXOEUIQEidCDXg' },
  { title: 'Coll HWKim', driveFolderId: '1Jy2isfoaKJkFD0PvrealmBPkL83kzYBh' },
  { title: '23New IH impactor', driveFolderId: '1f0sBPAGRLc3cZvtIeu5U45AGlzaWcuEC' },
  { title: 'Animal_DTI', driveFolderId: '1cE2pmo4_H8GdU-tvNbCSUO4bHAqLo1jQ' },
  { title: 'Organoid_microfludics', driveFolderId: '1n7v4yajIYrPkLi6nSoy7f3tfZWmy130x' }
];

const completedProjects = [
  { title: '21_02_Clinical DM Polymeuropathy_AI_Deargen', driveFolderId: '1uX56kfTL06Hj83YlYdU2qF6L2UygqYFe', type: 'ai_ml' },
  { title: '21_01_SCI Exercise', driveFolderId: '1dw9TNwvNtIVnRQDPThGaf08Mi8CNpaOl' },
  { title: '22_04_SCI RNA Seq', driveFolderId: '1d1_Ocgmdbv9NeH7qLSNTzCq3H7nrpjoL' },
  { title: '22_03_Clinical Stroke_Depression_ETRI', driveFolderId: '1E2ieQbG_4HQZnfuQu-RzwVFMo5wrMba-', type: 'clinical' },
  { title: '22_02_SCI RADA Peptide KIST', driveFolderId: '1dPXJkc6GcxNvjNsXbQzZgiuM-wsDWdr3' },
  { title: '22_01_Clinical Hybrid Prosthesis EEG EMG Postech', driveFolderId: '16bSVlJQEzdp0ICw0lqnFOaIAPYxPPd6W', type: 'clinical' },
  { title: '26_01 Hyperdurable robotic fingers_Kang', driveFolderId: '1aCG32Im4TiblTPmGyh6bbZ3o5iLeTjnE' },
  { title: '25_01 Sarcopenia CT Segmentation', driveFolderId: '1nwxIphAwJmeuhGLNMKzX-jxkSxkjKJms', type: 'ai_ml' },
  { title: '24_08_Sensor_Strain_SNU', driveFolderId: '1HWBpBUSOs4m96I75oFHSbL-XNa1reK8g' },
  { title: '24_04_Injectable Electrode SNU Kang', driveFolderId: '1Re7JrY5KNdk-JZlcUkRomFIQi-I3J79-' },
  { title: '24_05_Crack-based strain sensor SNU Kang', driveFolderId: '1zMcY0vou_0sdhPONMAFXTQC-80VMS4gV' },
  { title: '25_02_Clinical THRA Gait prediction', driveFolderId: '1oSScLCKOhmtB64lz4lViBWNaEi94uaEI', type: 'ai_ml' },
  { title: '24_06_Pig heart electrodes KAIST Park', driveFolderId: '1fwetQZTmkrmCU0UQIpUHMNYvYvHoW5En' },
  { title: '24_02_Clinical Sarcopenia Low dose CT', driveFolderId: '11OCM7GWOJEfjg_EsgXgjW71prnO9755J', type: 'clinical' },
  { title: '24_03_Review Innovative Tx NSCs SCI Front Cell Neurosci', driveFolderId: '1WJzSNGaGvxSqRRWHhpxKXVYLiB1MR8Qf', type: 'review', targetJournal: 'Frontiers in Cellular Neuroscience' },
  { title: '24_07_Sarcopenia_Lonarfarib', driveFolderId: '1KDkbQ_EnwtUM59Q5hLOg01XUgucaHINb' },
  { title: '25_03_Clinical Stroke Reattack JAHA', driveFolderId: '1PQB7r9zUfFywSzBeNdzKcRqwECi3aXXP', type: 'clinical' },
  { title: '23_02_시계열 전자의무기록을 이용한 딥러닝 기반 욕창 예측', driveFolderId: '1NB0KrjSoYusH06jpgMO7m3kmCU6FWYqy', type: 'ai_ml' },
  { title: '22_05_Editorial_Prediction of DSPN using ML', driveFolderId: '1vhgnz0MRiHSodCykyBXnmE30HB_jZmOB', type: 'review' },
  { title: '23_03_Sciatic Electrical Stim Scaffold_SNU', driveFolderId: '10YG-vOwScGV2j86zJFzUktrJyHxCRE0K' },
  { title: '23_01_SCI Silk_hydrogel', driveFolderId: '1liQ7LDH7AqIjHyNj4jhT06KCguv3cp96' },
  { title: '24_01_Clinical SCI Ulcer ML ETRI', driveFolderId: '1HqARvsiBy9TNsEgn8sn1orprIP2VE6TY', type: 'ai_ml' }
];

function inferType(title) {
  const text = title.toLowerCase();
  if (text.includes('review') || text.includes('editorial')) return 'review';
  if (
    text.includes(' ai') ||
    text.includes('_ai') ||
    text.includes(' ml') ||
    text.includes('prediction') ||
    text.includes('segmentation') ||
    text.includes('deep') ||
    text.includes('딥러닝')
  ) return 'ai_ml';
  if (
    text.includes('clinical') ||
    text.includes('pts') ||
    text.includes('stroke') ||
    text.includes('dti') ||
    text.includes('thra') ||
    text.includes('trauma') ||
    text.includes('gait') ||
    text.includes('mcs') ||
    text.includes('sep') ||
    text.includes('amantadine')
  ) return 'clinical';
  return 'experimental';
}

function inferPriority(title, potential, type) {
  const text = title.toLowerCase();
  if (potential === 'High') return 'A';
  if (
    type === 'review' ||
    text.includes('single cell') ||
    text.includes('porcine') ||
    text.includes('sarcopenia') ||
    text.includes('electrode') ||
    text.includes('scaffold') ||
    text.includes('tbi') ||
    text.includes('stroke') ||
    text.includes('exosome') ||
    text.includes('organoid')
  ) return 'B';
  return 'C';
}

function inferPotential(title, type) {
  const text = title.toLowerCase();
  if (
    type === 'ai_ml' ||
    text.includes('single cell') ||
    text.includes('porcine') ||
    text.includes('sarcopenia') ||
    text.includes('electrode') ||
    text.includes('scaffold') ||
    text.includes('hydrogel') ||
    text.includes('exosome') ||
    text.includes('crispr') ||
    text.includes('organoid') ||
    text.includes('tbi') ||
    text.includes('stroke')
  ) return 'High';
  return 'Medium';
}

function targetJournalFor(title, type) {
  const text = title.toLowerCase();
  if (text.includes('sarcopenia')) return 'Aging Cell / Journal of Cachexia, Sarcopenia and Muscle';
  if (type === 'review') return 'Progress in Neurobiology / Frontiers series';
  if (type === 'ai_ml') return 'npj Digital Medicine / Nature Biomedical Engineering';
  if (type === 'clinical') return 'Neurorehabilitation and Neural Repair / Journal of Neurotrauma';
  if (text.includes('scaffold') || text.includes('hydrogel') || text.includes('electrode')) return 'Advanced Science / Biomaterials';
  return 'Nature Biomedical Engineering / Advanced Science';
}

function centralClaimFor(title, type, completed) {
  if (completed) {
    return 'Accepted manuscript to mine for reusable methods, statistics, figure logic, reviewer-response strategy, and discussion framing.';
  }
  if (type === 'ai_ml') {
    return `${title} can become an AI-assisted manuscript if the dataset, leakage control, validation design, and clinically meaningful endpoint are locked early.`;
  }
  if (type === 'clinical') {
    return `${title} can become a clinical manuscript by clarifying cohort definition, primary endpoint, covariates, and target-journal reporting standards.`;
  }
  if (type === 'review') {
    return `${title} can become a review manuscript by converting the reference set into a structured evidence map and decisive outline.`;
  }
  return `${title} can become an experimental manuscript by mapping the core mechanism, decisive validation experiment, statistics, and figure sequence.`;
}

function nextActionFor(type, completed, chronology = {}) {
  if (completed) {
    return 'Extract reusable protocol language, statistical choices, figure order, reviewer concerns, and discussion patterns into the manuscript knowledge base.';
  }
  if (chronology.latestThesis && chronology.latestData) {
    return `파일명 날짜 기준으로 최신 원고(${chronology.latestThesis.filenameDate}, ${chronology.latestThesis.name})를 먼저 읽고, 최신 Data(${chronology.latestData.filenameDate}, ${chronology.latestData.name})가 Results, Figures, 통계 분석에 반영됐는지 대조합니다.`;
  }
  if (chronology.latestThesis) {
    return `파일명 날짜 기준으로 최신 원고(${chronology.latestThesis.filenameDate}, ${chronology.latestThesis.name})를 먼저 읽고, 이전 버전과 claim, Methods, Results, Discussion 변화를 비교합니다.`;
  }
  if (chronology.latestData) {
    return `파일명 날짜 기준으로 최신 Data(${chronology.latestData.filenameDate}, ${chronology.latestData.name})를 먼저 확인하고, 원고의 figure와 통계 분석에 연결합니다.`;
  }
  if (type === 'ai_ml') {
    return 'Confirm data dictionary, leakage risks, validation split, performance metrics, explainability plan, and target journal before drafting figures.';
  }
  if (type === 'clinical') {
    return 'Confirm cohort, inclusion criteria, endpoints, covariates, statistical model, missing-data plan, and target-journal checklist.';
  }
  if (type === 'review') {
    return 'Define review type, search strategy, inclusion logic, evidence table, visual framework, and target journal.';
  }
  return 'Open Plan/Data/Thesis/References, then decide the decisive experiment, control groups, statistics, and figure-level manuscript design.';
}

function foldersFor({ thesisCount = 0, dataCount = 0, figures = false }) {
  return [
    ...CORE_FOLDERS.map((type) => ({
      type,
      present: true,
      fileCount: type === 'Thesis' ? thesisCount : type === 'Data' ? dataCount : 0
    })),
    { type: 'Figures', present: figures, fileCount: 0 }
  ];
}

function versionBasisFor(latestThesis, latestData) {
  const parts = [];
  if (latestThesis) parts.push(`Thesis ${latestThesis.filenameDate}`);
  if (latestData) parts.push(`Data ${latestData.filenameDate}`);
  return parts.length > 0 ? `파일명 선두 날짜 기준: ${parts.join(', ')}` : '';
}

function createProject(input, rootFolder) {
  const type = input.type ?? inferType(input.title);
  const potential = input.potential ?? (rootFolder === '2_Thesis Completed' ? 'Accepted' : inferPotential(input.title, type));
  const priority = input.priority ?? (rootFolder === '2_Thesis Completed' ? 'Archive' : inferPriority(input.title, potential, type));
  const completed = rootFolder === '2_Thesis Completed';
  const thesisFiles = (input.thesisFiles ?? []).map(normalizeFile);
  const dataFiles = (input.dataFiles ?? []).map(normalizeFile);
  const latestThesis = latestByFilenameDate(thesisFiles, ['docx', 'doc', 'tex', 'md', 'pdf']);
  const latestData = latestByFilenameDate(dataFiles, ['xlsx', 'xls', 'csv', 'sav', 'rds', 'dta', 'pptx', 'pdf']);
  const thesisCount = input.thesisCount ?? thesisFiles.length;
  const dataCount = input.dataCount ?? dataFiles.length;
  const status = completed
    ? 'completed_archived'
    : input.status ?? (thesisCount > 0 ? 'ready_to_write' : 'candidate');

  return {
    id: `drive-${input.driveFolderId}`,
    title: input.title,
    rootFolder,
    driveUrl: `https://drive.google.com/drive/folders/${input.driveFolderId}`,
    type,
    status,
    priority,
    potential,
    targetJournal: input.targetJournal ?? (completed ? 'Accepted' : targetJournalFor(input.title, type)),
    centralClaim: input.centralClaim ?? centralClaimFor(input.title, type, completed),
    nextAction: input.nextAction ?? nextActionFor(type, completed, { latestThesis, latestData }),
    lastModifiedAt: input.lastModifiedAt ?? '2026-05-27T00:00:00.000Z',
    latestThesisDate: latestThesis?.filenameDate ?? '',
    latestThesisFile: latestThesis?.name ?? '',
    latestDataDate: latestData?.filenameDate ?? '',
    latestDataFile: latestData?.name ?? '',
    thesisFileNames: thesisFiles.map((file) => file.name),
    dataFileNames: dataFiles.map((file) => file.name),
    versionBasis: versionBasisFor(latestThesis, latestData),
    referenceBenchmarks: input.referenceBenchmarks ?? [],
    structureNote: input.structureNote ?? '',
    folders: foldersFor({
      thesisCount: completed ? 1 : thesisCount,
      dataCount,
      figures: input.figures ?? false
    })
  };
}

export const seedProjects = [
  ...activeProjects.map((project) => createProject(project, '1_Thesis')),
  ...completedProjects.map((project) => createProject(project, '2_Thesis Completed'))
];
