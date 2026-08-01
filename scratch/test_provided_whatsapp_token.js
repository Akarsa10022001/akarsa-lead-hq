const token = 'EAFZBNK408TEgBSHa8eIphtkHiFQ6Yxldjva42E4mSX85ZAtsc9GWkBWUIZBuECPsbmbPilSQ3WbTKZBj3AIzvC6Yj4JqsPa316URpyZABKMzPP09BPS6JbkcmuuQ6ua5JAh4ZCv9MpIZC1tiJ7jbBSOyogMxvQSoqYn4ZA2haacBp1DHjCZB84VMqoKD3qZCURBN8zAIdgfbSPzefyeReseC7ii5wxYwAL4CJ6kFUFyuxSRfn8V0l6N6De92BH0LZAE1EZCAyzGH8laYvjWCOLaIMyRLgAZDZD';

async function testWhatsAppToken() {
  console.log("=== TESTING PROVIDED META WHATSAPP ACCESS TOKEN ===");
  try {
    const res = await fetch(`https://graph.facebook.com/v18.0/me?fields=id,name`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    console.log("Meta API Response for /me:", data);

    // Test debug_token
    const debugRes = await fetch(`https://graph.facebook.com/v18.0/debug_token?input_token=${token}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const debugData = await debugRes.json();
    console.log("Meta Debug Token Response:", debugData);
  } catch (e) {
    console.error("Meta API Fetch Error:", e.message);
  }
}

testWhatsAppToken();
