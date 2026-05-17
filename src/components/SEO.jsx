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
  const siteTitle = "Vektor";
  const fullTitle = title ? `${title} | ${siteTitle}` : siteTitle;
  const defaultDescription = "The tactical workout platform for serious lifters. Track PRs, build programs, log nutrition, and get ML-powered exercise recommendations. Free forever.";
  const metaDescription = description || defaultDescription;

  const baseUrl = 'https://vektor.app';
  const finalOgImage = ogImage || `${baseUrl}/og-image.png`;
  const fullUrl = `${baseUrl}${canonical || ''}`;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={metaDescription} />
      {keywords && <meta name="keywords" content={keywords} />}
      {canonical && <link rel="canonical" href={fullUrl} />}

      <meta property="og:type" content={ogType} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={metaDescription} />
      <meta property="og:image" content={finalOgImage} />
      <meta property="og:url" content={fullUrl} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={metaDescription} />
      <meta name="twitter:image" content={finalOgImage} />

      {ldJson && (
        <script type="application/ld+json">
          {JSON.stringify(ldJson)}
        </script>
      )}
    </Helmet>
  );
};

export default SEO;
