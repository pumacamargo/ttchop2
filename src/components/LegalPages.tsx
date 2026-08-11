// Public legal pages (Terms of Service / Privacy Policy).
//
// These render OUTSIDE the AuthProvider (see main.tsx) because they must be reachable without an
// account — TikTok's developer review, app stores and browser extension stores all fetch them
// anonymously. Keep them dependency-free and self-contained for that reason.
import React from 'react';

const LAST_UPDATED = 'August 11, 2026';
const OWNER = 'Arturo Martin';
const CONTACT_EMAIL = 'puma.camargo@gmail.com';

// ── Shared shell ────────────────────────────────────────────────────────────

const LegalShell: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div style={{
    minHeight: '100vh', width: '100%', overflowY: 'auto',
    background: 'var(--bg-space)', color: 'var(--text-primary)',
    fontFamily: 'var(--font-sans)', padding: '2rem 1rem 4rem',
  }}>
    <div style={{ maxWidth: '760px', margin: '0 auto' }}>
      <header style={{ marginBottom: '2rem', paddingBottom: '1.25rem', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.25rem' }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8, background: 'var(--primary-glow)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <span style={{ color: 'var(--primary)', fontWeight: 800, fontSize: '0.9rem' }}>TT</span>
          </div>
          <span style={{
            fontFamily: 'var(--font-heading)', fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.02em',
            background: 'var(--gradient)', WebkitBackgroundClip: 'text', backgroundClip: 'text',
            WebkitTextFillColor: 'transparent', color: 'transparent',
          }}>TTChop</span>
        </div>
        <h1 style={{
          fontFamily: 'var(--font-heading)', fontSize: '1.9rem', fontWeight: 800,
          letterSpacing: '-0.02em', margin: 0, color: 'var(--text-primary)',
        }}>{title}</h1>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
          Last updated: {LAST_UPDATED}
        </p>
      </header>

      <main style={{ fontSize: '0.92rem', lineHeight: 1.7, color: 'var(--text-secondary)' }}>
        {children}
      </main>

      <footer style={{ marginTop: '3rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
        <p style={{ marginBottom: '0.5rem' }}>
          TTChop is operated by {OWNER}. Questions about this document:{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: 'var(--secondary)' }}>{CONTACT_EMAIL}</a>
        </p>
        <p>
          <a href="/terms" style={{ color: 'var(--secondary)' }}>Terms of Service</a>
          {' · '}
          <a href="/privacy" style={{ color: 'var(--secondary)' }}>Privacy Policy</a>
        </p>
      </footer>
    </div>
  </div>
);

const H2: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h2 style={{
    fontFamily: 'var(--font-heading)', fontSize: '1.15rem', fontWeight: 700,
    color: 'var(--text-primary)', marginTop: '2rem', marginBottom: '0.75rem', letterSpacing: '-0.01em',
  }}>{children}</h2>
);

const P: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p style={{ marginBottom: '0.9rem' }}>{children}</p>
);

const UL: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ul style={{ marginBottom: '0.9rem', paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
    {children}
  </ul>
);

// ── Terms of Service ────────────────────────────────────────────────────────

export const TermsOfServicePage: React.FC = () => (
  <LegalShell title="Terms of Service">
    <P>
      These Terms of Service ("Terms") govern your access to and use of TTChop (the "Service"), a web
      application and companion browser extension that helps sellers create and schedule short-form
      marketing videos for their products. By creating an account or using the Service, you agree to
      these Terms. If you do not agree, do not use the Service.
    </P>

    <H2>1. The Service</H2>
    <P>
      TTChop lets you import product information from TikTok Shop product pages, organize your own
      recorded video clips, generate marketing videos using automated and AI-assisted tools, schedule
      them on a calendar, and analyze sales performance by importing your own TikTok Shop reports.
      Optionally, you may connect a TikTok account to upload finished videos to that account.
    </P>
    <P>
      The Service is provided on an ongoing basis and may change. Features may be added, modified or
      removed. Some features depend on third-party services and may be unavailable at times.
    </P>

    <H2>2. Your account</H2>
    <UL>
      <li>You must provide an accurate email address and keep your password secure.</li>
      <li>You are responsible for all activity that occurs under your account.</li>
      <li>You must be old enough to form a binding contract in your jurisdiction, and at least 13 years old.</li>
      <li>Notify us at {CONTACT_EMAIL} if you believe your account has been accessed without authorization.</li>
    </UL>

    <H2>3. Your content</H2>
    <P>
      You retain ownership of everything you upload or create through the Service: your video clips,
      images, product descriptions, brand materials, scripts and generated videos ("Your Content").
    </P>
    <P>
      You grant us a limited, non-exclusive license to store, process, transmit and display Your Content
      solely for the purpose of operating the Service for you — for example, sending a clip to our video
      processing servers to render a finished video, or passing a product description to an AI provider
      to draft a script. We do not sell Your Content and we do not use it to train AI models.
    </P>

    <H2>4. Acceptable use</H2>
    <P>You agree not to use the Service to:</P>
    <UL>
      <li>Upload or generate content you do not have the rights to use.</li>
      <li>Infringe anyone's intellectual property, privacy or publicity rights.</li>
      <li>Create misleading, deceptive or unlawful advertising.</li>
      <li>Violate the terms, policies or community guidelines of TikTok or any other platform you publish to.</li>
      <li>Attempt to breach, overload, reverse engineer or gain unauthorized access to the Service.</li>
      <li>Use the browser extension to collect data at scale from pages other than product pages you are actively visiting.</li>
    </UL>

    <H2>5. AI-generated content</H2>
    <P>
      The Service uses automated and AI-assisted tools to draft scripts, synthesize voiceovers and
      assemble videos. AI output can be inaccurate, generic, or unsuitable for your purpose.{' '}
      <strong style={{ color: 'var(--text-primary)' }}>You are responsible for reviewing everything before
      you publish it</strong>, including factual claims about your products, and for ensuring it complies
      with advertising law and platform rules in your market.
    </P>

    <H2>6. TikTok integration</H2>
    <P>
      If you choose to connect a TikTok account, you authorize the Service to act on your behalf only
      within the scopes you approve — for example, uploading a video to your account's drafts. We do not
      publish content publicly without an action initiated by you. You remain responsible for complying
      with TikTok's own terms and policies. You can disconnect the account at any time, which revokes
      our access going forward.
    </P>
    <P>
      TTChop is an independent tool. It is not affiliated with, endorsed by, or sponsored by TikTok or
      ByteDance.
    </P>

    <H2>7. Third-party services</H2>
    <P>
      The Service relies on third parties to function, including cloud hosting and database providers,
      video processing servers, and AI providers for text and voice generation. Their availability and
      behavior are outside our control. See the <a href="/privacy" style={{ color: 'var(--secondary)' }}>Privacy
      Policy</a> for how data is shared with them.
    </P>

    <H2>8. Availability and no warranty</H2>
    <P>
      The Service is provided "as is" and "as available", without warranties of any kind, express or
      implied, including merchantability, fitness for a particular purpose and non-infringement. We do
      not warrant that the Service will be uninterrupted, error-free, or that any video will render
      successfully, be accepted by any platform, or produce any particular commercial result.
    </P>

    <H2>9. Limitation of liability</H2>
    <P>
      To the maximum extent permitted by applicable law, {OWNER} shall not be liable for any indirect,
      incidental, special, consequential or punitive damages, or for any loss of profits, revenue, data,
      or business opportunities, arising out of or related to your use of the Service. Nothing in these
      Terms limits liability that cannot be limited under applicable law.
    </P>

    <H2>10. Termination</H2>
    <P>
      You may stop using the Service and request deletion of your account at any time by writing to{' '}
      {CONTACT_EMAIL}. We may suspend or terminate access if you materially breach these Terms, or if
      required to do so by law. On termination, Your Content may be deleted; export anything you wish to
      keep beforehand.
    </P>

    <H2>11. Changes to these Terms</H2>
    <P>
      We may update these Terms as the Service evolves. When we do, we will update the "Last updated"
      date above. Material changes will be communicated through the Service or by email where reasonable.
      Continued use after a change means you accept the updated Terms.
    </P>

    <H2>12. Contact</H2>
    <P>
      Questions about these Terms: <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: 'var(--secondary)' }}>{CONTACT_EMAIL}</a>
    </P>
  </LegalShell>
);

// ── Privacy Policy ──────────────────────────────────────────────────────────

export const PrivacyPolicyPage: React.FC = () => (
  <LegalShell title="Privacy Policy">
    <P>
      This Privacy Policy explains what information TTChop (the "Service") collects, why it collects it,
      who it is shared with, and the choices you have. It applies to the TTChop web application and its
      companion browser extension.
    </P>

    <H2>1. Information we collect</H2>

    <P><strong style={{ color: 'var(--text-primary)' }}>Account information.</strong> When you register we
    collect your email address and a password. Passwords are handled by our authentication provider and
    stored as salted hashes; we never see or store your password in readable form.</P>

    <P><strong style={{ color: 'var(--text-primary)' }}>Product information you import.</strong> When you
    use the browser extension on a TikTok Shop product page, it reads publicly visible information from
    that page — product name, description, images, region, and the product's public URL and identifier —
    and saves it to your account. The extension only acts on product pages where you explicitly trigger
    it. It does not track your browsing, read other sites, or run in the background.</P>

    <P><strong style={{ color: 'var(--text-primary)' }}>Content you upload or create.</strong> Video clips
    you record and upload, images, brand materials such as reference images and fonts, scripts, notes,
    your content strategy text, and the videos generated by the Service.</P>

    <P><strong style={{ color: 'var(--text-primary)' }}>Sales reports you import.</strong> If you upload a
    TikTok Shop order export, we store the rows it contains — order and SKU identifiers, product names,
    quantities, revenue amounts, currency, order dates and the content identifier of the video associated
    with each sale — so the Service can show you which videos are producing sales.</P>

    <P><strong style={{ color: 'var(--text-primary)' }}>TikTok account data.</strong> If you connect a
    TikTok account, we store the access tokens needed to act within the permissions you granted, along
    with the account handle and display name. We access only what those permissions allow.</P>

    <P><strong style={{ color: 'var(--text-primary)' }}>Local browser storage.</strong> The Service stores
    a small amount of data in your browser to keep you signed in and to remember preferences such as your
    interface language and timezone. We do not use advertising or cross-site tracking cookies.</P>

    <H2>2. What we do not collect</H2>
    <UL>
      <li>We do not collect payment card information.</li>
      <li>We do not collect your browsing history.</li>
      <li>We do not buy personal data from third parties or build advertising profiles.</li>
    </UL>

    <H2>3. How we use your information</H2>
    <UL>
      <li>To operate the Service: store your products, clips and videos and make them available to you.</li>
      <li>To generate videos: send the material you selected to our video processing servers and AI providers.</li>
      <li>To show analytics: match the sales reports you import against the videos you created.</li>
      <li>To publish on your behalf, only when you initiate it and only within the TikTok permissions you granted.</li>
      <li>To secure the Service, prevent abuse, and diagnose errors.</li>
      <li>To contact you about your account or material changes to the Service.</li>
    </UL>
    <P>
      We do not sell your personal information, and we do not use your content to train AI models.
    </P>

    <H2>4. Who we share information with</H2>
    <P>We share information only with providers that make the Service work, and only as needed:</P>
    <UL>
      <li><strong style={{ color: 'var(--text-primary)' }}>Google Firebase</strong> — authentication, database, file storage and hosting. Your account data, product records and uploaded files are stored on Google Cloud infrastructure.</li>
      <li><strong style={{ color: 'var(--text-primary)' }}>Our video processing servers</strong> — receive the clips, audio and templates needed to render a finished video.</li>
      <li><strong style={{ color: 'var(--text-primary)' }}>AI providers</strong> — receive product descriptions, prompts and script text to generate scripts and synthesized voiceovers.</li>
      <li><strong style={{ color: 'var(--text-primary)' }}>TikTok</strong> — receives a video only when you choose to upload one to your connected account.</li>
    </UL>
    <P>
      We may also disclose information if required by law, or to protect the rights, safety or property
      of users or the public.
    </P>

    <H2>5. International transfers</H2>
    <P>
      Our providers operate data centers in multiple countries, so your information may be stored or
      processed outside your country of residence. We rely on providers that offer recognized safeguards
      for such transfers.
    </P>

    <H2>6. Retention</H2>
    <P>
      We keep your information for as long as your account is active. If you delete specific content it is
      removed from our active systems, though it may persist briefly in backups. If you close your
      account, we delete your data within a reasonable period unless we are required to retain it by law.
    </P>

    <H2>7. Your rights and choices</H2>
    <P>
      Depending on where you live, you may have rights to access, correct, export or delete your personal
      information, to object to or restrict certain processing, and to withdraw consent. Users in the
      European Economic Area and the United Kingdom have these rights under the GDPR; residents of
      California have comparable rights under the CCPA/CPRA, including the right not to be discriminated
      against for exercising them. Because we do not sell personal information, there is no sale to opt
      out of.
    </P>
    <P>
      Within the Service you can edit or delete your products, clips, videos and brand materials at any
      time, and you can disconnect a TikTok account at any time. To request access to or deletion of your
      account and all associated data, write to{' '}
      <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: 'var(--secondary)' }}>{CONTACT_EMAIL}</a>. We
      respond within 30 days.
    </P>

    <H2>8. Security</H2>
    <P>
      Data is transmitted over encrypted connections and stored with access rules that restrict each
      account's data to that account. No method of transmission or storage is completely secure, so we
      cannot guarantee absolute security. If a breach affects your personal information, we will notify
      you as required by applicable law.
    </P>

    <H2>9. Children</H2>
    <P>
      The Service is not directed to children and is not intended for anyone under 13. We do not knowingly
      collect personal information from children. If you believe a child has provided us information,
      contact us and we will delete it.
    </P>

    <H2>10. Changes to this policy</H2>
    <P>
      We may update this Privacy Policy as the Service evolves. The "Last updated" date above reflects the
      most recent version. Material changes will be communicated through the Service or by email where
      reasonable.
    </P>

    <H2>11. Contact</H2>
    <P>
      TTChop is operated by {OWNER}. For any privacy question or request, write to{' '}
      <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: 'var(--secondary)' }}>{CONTACT_EMAIL}</a>.
    </P>
  </LegalShell>
);
