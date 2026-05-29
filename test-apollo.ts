import { config } from "dotenv";
config();

async function main() {
  const apiKey = "fQLHnrE_mfMbhTo-clj9aA"; // User's Apollo API Key
  const domain = "yourstory.com";

  console.log(`Searching Apollo.io for domain: ${domain}...`);

  // Step 1: mixed_people/search (or api_search)
  const searchUrl = "https://api.apollo.io/v1/mixed_people/search";
  try {
    const response = await fetch(searchUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache"
      },
      body: JSON.stringify({
        api_key: apiKey,
        q_organization_domains: [domain],
        person_titles: ["founder", "co-founder", "ceo", "co-founder & ceo", "co founder"]
      })
    });

    console.log("Search HTTP status:", response.status);
    const data = (await response.json()) as any;
    console.log("Search response keys:", Object.keys(data));
    
    if (data.contacts && data.contacts.length > 0) {
      console.log(`Found ${data.contacts.length} contacts!`);
      const contact = data.contacts[0];
      console.log("First contact details:", {
        id: contact.id,
        first_name: contact.first_name,
        last_name: contact.last_name,
        title: contact.title,
        email: contact.email // Sometimes mixed_people/search returns email directly if we have credits/plan!
      });

      // If email is not present, enrich it using bulk_match or match
      if (!contact.email) {
        console.log("Email not returned directly. Calling people/bulk_match...");
        const matchUrl = "https://api.apollo.io/v1/people/bulk_match";
        const matchResponse = await fetch(matchUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache"
          },
          body: JSON.stringify({
            api_key: apiKey,
            ids: [contact.id]
          })
        });

        console.log("Bulk match status:", matchResponse.status);
        const matchData = (await matchResponse.json()) as any;
        console.log("Bulk match response keys:", Object.keys(matchData));
        if (matchData.matches && matchData.matches.length > 0) {
          console.log("Matched contact email:", matchData.matches[0].email);
        } else if (matchData.contacts && matchData.contacts.length > 0) {
          console.log("Matched contact email (contacts field):", matchData.contacts[0].email);
        } else {
          console.log("No email found in bulk match. Full response:", JSON.stringify(matchData, null, 2));
        }
      }
    } else {
      console.log("No contacts found. Full search response:", JSON.stringify(data, null, 2));
    }
  } catch (err: any) {
    console.error("Error calling Apollo API:", err);
  }
}

main();
