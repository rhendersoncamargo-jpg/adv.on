import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const sources = {
  trt2: "C:/Users/rhend/Downloads/contatos telefonicos/Tribunal Regional do Trabalho da 24ª Região - 2 Grau.md",
  tjms: "C:/Users/rhend/Downloads/contatos telefonicos/telefones tjms.md",
  trt1: "C:/Users/rhend/Downloads/contatos telefonicos/Tribunal Regional do Trabalho da 24ª Região - 1 Grau.md",
};

const output = new URL("../data/useful-phone-import.json", import.meta.url);

function cleanText(value) {
  return value
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_#`\\]/g, "")
    .replace(/([a-zá-ú])([A-ZÁ-Ú])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
}

function normalizePhone(value) {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length >= 12) digits = digits.slice(2);
  if (digits.length === 8 || digits.length === 9) digits = `67${digits}`;
  if (digits.length > 11) digits = digits.slice(0, 11);
  if (digits.length !== 10 && digits.length !== 11) return "";
  const ddd = digits.slice(0, 2);
  const local = digits.slice(2);
  return local.length === 9
    ? `(${ddd}) ${local.slice(0, 5)}-${local.slice(5)}`
    : `(${ddd}) ${local.slice(0, 4)}-${local.slice(4)}`;
}

function phonesFromLooseLine(line) {
  const withoutEmail = line.replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "");
  const starts = [...withoutEmail.matchAll(/(?:55\D*)?67(?=\D*\d)/g)];
  const values = [];
  if (starts.length) {
    for (let index = 0; index < starts.length; index += 1) {
      const start = starts[index].index;
      const end = starts[index + 1]?.index ?? withoutEmail.length;
      const parts = withoutEmail.slice(start, end).split(/\s*(?:\/|\bou\b)\s*/i);
      for (let partIndex = 0; partIndex < parts.length; partIndex += 1) {
        const candidate = partIndex === 0 ? parts[partIndex] : (/67/.test(parts[partIndex]) ? parts[partIndex] : `67 ${parts[partIndex]}`);
        const phone = normalizePhone(candidate);
        if (phone) values.push(phone);
      }
    }
  } else {
    const candidates = withoutEmail.match(/\d[\d\s().-]{6,}\d/g) || [];
    for (const candidate of candidates) {
      const phone = normalizePhone(candidate);
      if (phone) values.push(phone);
    }
  }
  return [...new Set(values)];
}

function emailFrom(line) {
  return line.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)?.[0]?.replace(/[.,;:]$/, "") || "";
}

function stableId(category, name, phone) {
  return `import-${createHash("sha256").update(`${category}|${name}|${phone}`.toLocaleLowerCase("pt-BR")).digest("hex").slice(0, 24)}`;
}

function record(category, name, phone, city = "", notes = "") {
  const normalizedName = cleanText(name).slice(0, 160);
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedName || !normalizedPhone) return null;
  return {
    id: stableId(category, normalizedName, normalizedPhone),
    name: normalizedName,
    category,
    phone: normalizedPhone,
    extension: "",
    city: cleanText(city).slice(0, 100),
    notes: cleanText(notes).slice(0, 2000),
  };
}

function parseTrt(path, category, defaultCity, sourceLabel) {
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  const results = [];
  let city = defaultCity;
  for (const line of lines) {
    const heading = line.match(/^##\s+(.+)/);
    if (heading && !/^#/.test(heading[1])) city = cleanText(heading[1]);
    const telMatches = [...line.matchAll(/tel:\+?(\d+)/g)];
    if (!telMatches.length) continue;
    const email = emailFrom(line.replace(/\\_/g, "_"));
    let name = "";
    if (line.trim().startsWith("|")) {
      const cells = line.split("|").slice(1, -1).map(cleanText);
      name = cells[0] || "Unidade do TRT";
      const second = cells[1] || "";
      if (second && !/telefone|e-mail|@|\(67\)|tel:/i.test(second)) name = `${name} — ${second}`;
    } else {
      name = cleanText(line.split("[(")[0]).replace(/^[-–]\s*/, "").replace(/:$/, "") || "Atendimento do TRT";
    }
    for (const match of telMatches) {
      const notes = [`Origem: TRT24 — ${sourceLabel}`, email ? `E-mail: ${email}` : ""].filter(Boolean).join(" · ");
      const item = record(category, name, match[1], city, notes);
      if (item) results.push(item);
    }
    const firstPhone = normalizePhone(telMatches[0][1]);
    const prefix = firstPhone.replace(/\D/g, "").slice(0, 6);
    for (const short of line.matchAll(/\bou\s+(\d{4})\b/gi)) {
      const notes = [`Origem: TRT24 — ${sourceLabel}`, email ? `E-mail: ${email}` : ""].filter(Boolean).join(" · ");
      const item = record(category, name, `${prefix}${short[1]}`, city, notes);
      if (item) results.push(item);
    }
  }
  return results;
}

const msCities = new Set([
  "Água Clara", "Alcinópolis", "Amambai", "Anastácio", "Anaurilândia", "Angélica", "Antônio João", "Aparecida do Taboado", "Aquidauana", "Aral Moreira", "Bandeirantes", "Bataguassu", "Batayporã", "Bela Vista", "Bodoquena", "Bonito", "Brasilândia", "Caarapó", "Camapuã", "Campo Grande", "Caracol", "Cassilândia", "Chapadão do Sul", "Corguinho", "Coronel Sapucaia", "Corumbá", "Costa Rica", "Coxim", "Deodápolis", "Dois Irmãos do Buriti", "Douradina", "Dourados", "Eldorado", "Fátima do Sul", "Figueirão", "Glória de Dourados", "Guia Lopes da Laguna", "Iguatemi", "Inocência", "Itaporã", "Itaquiraí", "Ivinhema", "Japorã", "Jaraguari", "Jardim", "Jateí", "Juti", "Ladário", "Laguna Carapã", "Maracaju", "Miranda", "Mundo Novo", "Naviraí", "Nioaque", "Nova Alvorada do Sul", "Nova Andradina", "Novo Horizonte do Sul", "Paranaíba", "Paranhos", "Pedro Gomes", "Ponta Porã", "Porto Murtinho", "Ribas do Rio Pardo", "Rio Brilhante", "Rio Negro", "Rio Verde de Mato Grosso", "Rochedo", "Santa Rita do Pardo", "São Gabriel do Oeste", "Selvíria", "Sete Quedas", "Sidrolândia", "Sonora", "Tacuru", "Taquarussu", "Terenos", "Três Lagoas", "Vicentina"
]);

function parseTjms(path) {
  const lines = readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter((line) => !line.startsWith("![](data:image") && line.trim() && line.trim() !== "---" && !line.startsWith("[^"));
  const results = [];
  let city = "";
  let pendingName = "";
  for (const rawLine of lines) {
    const line = cleanText(rawLine);
    if (!line || line === "-") continue;
    if (msCities.has(line) || line === "Tribunal de Justiça") {
      if (line === "Tribunal de Justiça") city = "Campo Grande";
      else city = line;
      pendingName = "";
      continue;
    }
    const phones = phonesFromLooseLine(line);
    if (!phones.length) {
      pendingName = line;
      continue;
    }
    const email = emailFrom(line);
    const name = pendingName || "Unidade do TJMS";
    for (const phone of phones) {
      const notes = email ? `E-mail: ${email}` : "";
      const item = record("TJMS", name, phone, city || (name.includes("Central de Processamento") ? "Campo Grande" : ""), notes);
      if (item) results.push(item);
    }
    pendingName = "";
  }
  return results;
}

const raw = [
  ...parseTrt(sources.trt2, "TRT24", "Campo Grande", "2º Grau"),
  ...parseTjms(sources.tjms),
  ...parseTrt(sources.trt1, "TRT24", "Campo Grande", "1º Grau"),
];

const unique = new Map();
for (const item of raw) unique.set(`${item.name.toLocaleLowerCase("pt-BR")}|${item.phone.replace(/\D/g, "")}`, item);
const records = [...unique.values()].sort((a, b) => a.category.localeCompare(b.category, "pt-BR") || a.city.localeCompare(b.city, "pt-BR") || a.name.localeCompare(b.name, "pt-BR"));

writeFileSync(output, `${JSON.stringify(records, null, 2)}\n`, "utf8");
const byCategory = Object.groupBy(records, (item) => item.category);
console.log(JSON.stringify({ total: records.length, categories: Object.fromEntries(Object.entries(byCategory).map(([key, values]) => [key, values.length])), withCity: records.filter((item) => item.city).length, withNotes: records.filter((item) => item.notes).length }, null, 2));
