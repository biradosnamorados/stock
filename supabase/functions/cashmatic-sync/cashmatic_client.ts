// Cliente HTTPS mínimo para a API Cashmatic.
// Liga por TCP ao IP público (via reencaminhamento de porta) e valida o certificado
// contra a CA da própria máquina (BN Braga), verificando o nome pelo IP interno que consta no certificado.

export const CASHMATIC_CA = `-----BEGIN CERTIFICATE-----
MIIDvjCCAqagAwIBAgIJAPWusbp2zcXWMA0GCSqGSIb3DQEBCwUAMHMxGTAXBgNV
BAMMEENhc2htYXRpYyBTLnIubC4xHTAbBgNVBAsMFENhc2htYXRpYyBTRUxGcGF5
IENBMRkwFwYDVQQKDBBDYXNobWF0aWMgUy5yLmwuMQ8wDQYDVQQHDAZEb2dhbmEx
CzAJBgNVBAYTAlNNMCAXDTIzMTEyODEyNDk1MFoYDzIxMjMxMTA0MTI0OTUwWjBz
MRkwFwYDVQQDDBBDYXNobWF0aWMgUy5yLmwuMR0wGwYDVQQLDBRDYXNobWF0aWMg
U0VMRnBheSBDQTEZMBcGA1UECgwQQ2FzaG1hdGljIFMuci5sLjEPMA0GA1UEBwwG
RG9nYW5hMQswCQYDVQQGEwJTTTCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoC
ggEBALbtMznDV6TCq4YCnUXTnKJFU6KVwdFWrHDNPuOQRr71a2Z7wO0Goci1FvZt
IZmZpublrglMoRsDtTsxALxty3EQuXMLvgitp8H3/lsc2dtml+3YuY8SyNRmp4FO
soSeMI8yk7Pke9DSFFiB9CccuWkN9rXy+ln91+40jGKJduHN7fOQrKKdoJhpb4xg
EhzESloR5NHknQzACDHZIVZCWIUGA/uXeMzdbZn9SKJh4ww2Lh/Nog6WUPaYMr31
/WiWblUU3EpyU7OqTI/hSJn6D9OJZX9KEUX/0WYfYkuXgGWI6caQgHKaw1We/iul
pd32lGmfg6gA3JviyFMQl3HHuIUCAwEAAaNTMFEwHQYDVR0OBBYEFE4tUSuOmJDP
RnLySFV6BTrVb6FLMB8GA1UdIwQYMBaAFE4tUSuOmJDPRnLySFV6BTrVb6FLMA8G
A1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBAAa1Iy3qAbQPdLBSCoMN
DhX/UtSxeBgiiNRag0IWaOxq9vGSKpC8jHxW7ZC1HNxmNyEBnDyLhX+7lPCVaogX
vO1M35DyascTDGtcEbU9XJR7rZ8rfUuEcxLd+h4OZDonvtCWdY6pPJfPdNyLkjXZ
EODIB7aMOukrBUgzz8LyQOgX3YFNvIkQtaxi5NLpi28gF13Xxy9wOAqJ4txXdwsH
XzjwEQDAAmDkx6St4FfRo44798BwP9JYThEH2Z5bs9c3aLsxFjGM7Gl41vjQbfnN
nALP8bHba8hoeLfJcvvckTbdyLCjsVq49YEJu7kgYTsoT0meF5T63S3XWTSjEwQH
wqk=
-----END CERTIFICATE-----`;

export interface CashmaticTarget {
  host: string;        // IP público
  port: number;        // porta externa
  tlsName: string;     // nome/IP que consta no certificado (ex.: 10.0.0.10)
}

function concat(chunks: Uint8Array[]) {
  const len = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

function indexOfSeq(buf: Uint8Array, seq: number[], from = 0) {
  outer: for (let i = from; i <= buf.length - seq.length; i++) {
    for (let j = 0; j < seq.length; j++) if (buf[i + j] !== seq[j]) continue outer;
    return i;
  }
  return -1;
}

function dechunk(body: Uint8Array) {
  const parts: Uint8Array[] = [];
  let i = 0;
  const dec = new TextDecoder();
  while (i < body.length) {
    const nl = indexOfSeq(body, [13, 10], i);
    if (nl < 0) break;
    const size = parseInt(dec.decode(body.subarray(i, nl)).split(";")[0].trim(), 16);
    if (!size) break;
    parts.push(body.subarray(nl + 2, nl + 2 + size));
    i = nl + 2 + size + 2;
  }
  return concat(parts);
}

export async function cashmaticPost(t: CashmaticTarget, path: string, payload: unknown, token?: string, timeoutMs = 15000) {
  const body = new TextEncoder().encode(JSON.stringify(payload ?? {}));
  const head =
    `POST ${path} HTTP/1.1\r\n` +
    `Host: ${t.tlsName}:50301\r\n` +
    `Content-Type: application/json\r\n` +
    (token ? `Authorization: Bearer ${token}\r\n` : "") +
    `Content-Length: ${body.length}\r\n` +
    `Connection: close\r\n\r\n`;

  let conn: Deno.Conn | null = null;
  const timer = setTimeout(() => { try { conn?.close(); } catch { /* */ } }, timeoutMs);
  try {
    const tcp = await Deno.connect({ hostname: t.host, port: t.port });
    conn = tcp;
    const tls = await Deno.startTls(tcp, { hostname: t.tlsName, caCerts: [CASHMATIC_CA] });
    conn = tls;
    await tls.write(concat([new TextEncoder().encode(head), body]));
    const chunks: Uint8Array[] = [];
    const buf = new Uint8Array(16384);
    while (true) {
      let n: number | null = null;
      try { n = await tls.read(buf); } catch (e) {
        if (chunks.length) break; // alguns servidores fecham sem close_notify
        throw e;
      }
      if (n === null) break;
      chunks.push(buf.slice(0, n));
    }
    const raw = concat(chunks);
    const sep = indexOfSeq(raw, [13, 10, 13, 10]);
    if (sep < 0) throw new Error("Resposta inválida da máquina");
    const headers = new TextDecoder().decode(raw.subarray(0, sep));
    const status = parseInt(headers.split(" ")[1] ?? "0", 10);
    let rawBody = raw.subarray(sep + 4);
    if (/transfer-encoding:\s*chunked/i.test(headers)) rawBody = dechunk(rawBody);
    const text = new TextDecoder().decode(rawBody);
    let data: any;
    try { data = JSON.parse(text); } catch { throw new Error(`Resposta não-JSON (HTTP ${status}): ${text.slice(0, 200)}`); }
    if (data?.code !== 0) throw new Error(`Cashmatic ${path}: ${data?.message ?? status} (código ${data?.code})`);
    return data.data;
  } finally {
    clearTimeout(timer);
    try { conn?.close(); } catch { /* */ }
  }
}
