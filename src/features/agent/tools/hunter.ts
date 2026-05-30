export async function findHunterEmail(firstName: string, lastName: string, domain: string) {
  console.log(`[Hunter] Finding email for ${firstName} ${lastName} at ${domain}...`);
  const apiKey = process.env.HUNTER_API_KEY;
  if (!apiKey) {
    throw new Error("HUNTER_API_KEY is not configured.");
  }

  const url = `https://api.hunter.io/v2/email-finder?domain=${encodeURIComponent(
    domain
  )}&first_name=${encodeURIComponent(firstName)}&last_name=${encodeURIComponent(
    lastName
  )}&api_key=${apiKey}`;

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok || !data.data) {
    console.log(`[Hunter] No email found. Response: ${JSON.stringify(data)}`);
    return {
      email: null,
      score: 0,
      verificationStatus: "not_found",
    };
  }

  const result = {
    email: data.data.email,
    score: data.data.score,
    verificationStatus: data.data.verification?.status || "unknown",
  };

  console.log(`[Hunter] Email found: ${result.email}`);
  return result;
}

export async function verifyHunterEmail(email: string) {
  console.log(`[Hunter] Verifying email: ${email}...`);
  const apiKey = process.env.HUNTER_API_KEY;
  if (!apiKey) {
    throw new Error("HUNTER_API_KEY is not configured.");
  }

  const url = `https://api.hunter.io/v2/email-verifier?email=${encodeURIComponent(
    email
  )}&api_key=${apiKey}`;

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok || !data.data) {
    console.log(`[Hunter] Verification failed. Response: ${JSON.stringify(data)}`);
    return {
      status: "unknown",
      score: 0,
    };
  }

  const result = {
    status: data.data.status, // "deliverable", "risky", "invalid", "accept_all"
    score: data.data.score,
  };

  console.log(`[Hunter] Verification status: ${result.status}`);
  console.log(`[Hunter] Verification score: ${result.score}`);
  console.log(`[Hunter] Deliverable: ${result.status === "deliverable" || result.status === "valid"}`);

  return result;
}
