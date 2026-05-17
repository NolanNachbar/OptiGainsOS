import { Helmet } from 'react-helmet-async';

const SEO = ({ 
  title, 
  description, 
  canonical, 
  ogType = 'website', 
  ogImage,
  keywords,
  ldJson
}) => {
  const siteTitle = "Sisyphus' Schedule";
  const fullTitle = title ? `${title} | ${siteTitle}` : siteTitle;
  const defaultDescription = "The ultimate workout tracking platform for serious lifters. Track PRs, build programs, log nutrition, and get ML-powered exercise recommendations. Free forever.";
  const metaDescription = description || defaultDescription;
  
  const baseUrl = 'https://sisyphusschedule.com';
  const finalOgImage = ogImage || `${baseUrl}/og-image.png`;
  const fullUrl = `${baseUrl}${canonical || ''}`;
  
  return (
    <Helmet>
      {/* Standard metadata */}
      <title>{fullTitle}</title>
      <meta name="description" content={metaDescription} />
      {keywords && <meta name="keywords" content={keywords} />}
      {canonical && <link rel="canonical" href={fullUrl} />}

      {/* Open Graph / Facebook */}
      <meta property="og:type" content={ogType} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={metaDescription} />
      <meta property="og:image" content={finalOgImage} />
      <meta property="og:url" content={fullUrl} />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={metaDescription} />
      <meta name="twitter:image" content={finalOgImage} />

      {/* Structured Data */}
      {ldJson && (
        <script type="application/ld+json">
          {JSON.stringify(ldJson)}
        </script>
      )}
    </Helmet>
  );
};

export default SEO;
