export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background p-8 md:p-16">
      <div className="max-w-3xl mx-auto bg-card border border-border rounded-2xl p-8 shadow-xl">
        <h1 className="text-3xl font-bold mb-6">Privacy Policy for Akarsa Lead HQ</h1>
        <p className="text-muted-foreground mb-4">Last Updated: {new Date().toLocaleDateString()}</p>
        
        <div className="space-y-6 text-sm text-foreground/80 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold mb-2 text-foreground">1. Introduction</h2>
            <p>Welcome to Akarsa Lead HQ. This privacy policy explains how we collect, use, and protect your information when you use our internal B2B lead generation tool.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2 text-foreground">2. Information Collection</h2>
            <p>We collect business contact information (names, company names, business phone numbers, and emails) primarily from public sources such as OpenStreetMap and public websites. We only collect information strictly necessary for B2B outreach purposes.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2 text-foreground">3. Use of Information</h2>
            <p>The information we collect is used exclusively for internal B2B sales and marketing outreach. We do not sell, rent, or share this data with third-party data brokers. We utilize third-party APIs (like Meta's WhatsApp Cloud API) strictly for the purpose of transmitting our authorized messages.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2 text-foreground">4. Data Protection</h2>
            <p>We implement standard security measures to protect the data stored in our database. Access to this tool is restricted to authorized Akarsa personnel.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-2 text-foreground">5. Contact Us</h2>
            <p>If you have questions about this privacy policy or wish to opt-out of communications, please contact us at: beakarsa@gmail.com.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
