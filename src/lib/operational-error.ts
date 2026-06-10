export type OperationalError = {
  title: string;
  message: string;
  action: string;
};

export function toOperationalError(error: unknown): OperationalError {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("Google OAuth refresh failed: invalid_client")) {
    return {
      title: "Google Drive OAuth client 설정 오류",
      message:
        "Google Drive refresh token 갱신이 거부되었습니다. GOOGLE_DRIVE_CLIENT_ID 또는 GOOGLE_DRIVE_CLIENT_SECRET 값이 올바르지 않거나, refresh token을 발급한 OAuth client와 다른 값입니다.",
      action:
        "Google Cloud Console의 OAuth Client ID와 Client Secret을 다시 확인한 뒤, 같은 값으로 npm run google-drive:oauth를 실행해 GOOGLE_DRIVE_REFRESH_TOKEN을 새로 발급하세요. GitHub Secrets와 Vercel Environment Variables도 같은 값으로 맞춰야 합니다.",
    };
  }

  if (message.includes("Google OAuth refresh failed: invalid_grant")) {
    return {
      title: "Google Drive refresh token 오류",
      message:
        "Google Drive refresh token이 만료, 취소, 오복사되었거나 현재 OAuth client와 맞지 않습니다.",
      action:
        "현재 GOOGLE_DRIVE_CLIENT_ID와 GOOGLE_DRIVE_CLIENT_SECRET을 사용해 npm run google-drive:oauth를 다시 실행하고, 새 GOOGLE_DRIVE_REFRESH_TOKEN을 GitHub와 Vercel에 반영하세요.",
    };
  }

  if (message.includes("Google Drive")) {
    return {
      title: "Google Drive 연결 오류",
      message,
      action:
        "REPORT_STORAGE_BACKEND=google-drive 설정과 Google Drive OAuth 3종 값을 확인하세요. 배포 환경을 수정한 뒤에는 Vercel redeploy가 필요합니다.",
    };
  }

  return {
    title: "대시보드 데이터 로드 오류",
    message,
    action: "서버 로그와 환경변수를 확인한 뒤 다시 로드하세요.",
  };
}
