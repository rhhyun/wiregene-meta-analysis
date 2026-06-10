import {
  getBasicAuthCredentialsFromEnv,
  isAdminUsername,
  parseBasicAuthCredential,
  type BasicAuthCredential,
} from "./basic-auth-users";

type AuthSessionEnv = Record<string, string | undefined>;

export type CurrentWiregeneUser = {
  username: string;
  role: "admin" | "user";
  roleLabel: "관리자" | "사용자";
  isAdmin: boolean;
};

export function getCurrentWiregeneUser(
  authorization: string | undefined | null,
  env: AuthSessionEnv = process.env,
): CurrentWiregeneUser | null {
  const providedCredential = parseBasicAuthCredential(authorization ?? "");
  if (!providedCredential) return null;

  const matchedCredential = getBasicAuthCredentialsFromEnv(env).find((credential) =>
    matchesCredential(credential, providedCredential),
  );
  if (!matchedCredential) return null;

  const isAdmin = isAdminUsername(matchedCredential.username, env);

  return {
    username: matchedCredential.username,
    role: isAdmin ? "admin" : "user",
    roleLabel: isAdmin ? "관리자" : "사용자",
    isAdmin,
  };
}

function matchesCredential(
  expected: BasicAuthCredential,
  provided: Pick<BasicAuthCredential, "username" | "password">,
) {
  return expected.username === provided.username && expected.password === provided.password;
}
