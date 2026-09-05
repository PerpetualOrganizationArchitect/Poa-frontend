import { Html, Head, Main, NextScript } from "next/document";


export default function Document() {
  return (
    <>
    <Html lang="en">
      <Head>
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/images/poa_logo.png" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#7C3AED" />
        <meta name="application-name" content="Poa" />
        <meta name="apple-mobile-web-app-title" content="Poa" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
    </>
  );
}
