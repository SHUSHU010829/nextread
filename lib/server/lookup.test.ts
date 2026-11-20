import { test } from "node:test";
import assert from "node:assert/strict";
import { best, googleBooks, googleQuery, openLibrary, parseQuery, searchAll, type Provider } from "./lookup.ts";

/** 依 URL 回傳假資料的 fetch。 */
function fakeFetch(routes: Record<string, unknown>, seen: string[] = []): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    seen.push(url);
    const u = new URL(url);
    const body = routes[u.pathname];
    if (body === undefined) return new Response("not found", { status: 404 });
    return Response.json(body);
  }) as typeof fetch;
}

test("parseQuery", () => {
  assert.deepEqual(parseQuery(" 978-986-479-290-1 "), { isbn: "9789864792901" });
  assert.deepEqual(parseQuery("被討厭的勇氣"), { text: "被討厭的勇氣" });
});

test("googleQuery", () => {
  assert.equal(googleQuery({ title: "三體", author: "劉慈欣" }), "intitle:三體 inauthor:劉慈欣");
  assert.equal(googleQuery({ isbn: "9789573327059" }), "isbn:9789573327059");
});

test("Google Books parsing", async () => {
  const seen: string[] = [];
  const g = googleBooks({
    apiKey: "k",
    baseURL: "https://gb.test/books/v1",
    fetch: fakeFetch(
      {
        "/books/v1/volumes": {
          items: [
            {
              volumeInfo: {
                title: "被討厭的勇氣",
                authors: ["岸見一郎", "古賀史健"],
                description: "<p>阿德勒心理學</p><p>第二段&amp;結尾</p>",
                categories: ["Psychology"],
                industryIdentifiers: [
                  { type: "ISBN_10", identifier: "9861342331" },
                  { type: "ISBN_13", identifier: "9789861342338" },
                ],
                imageLinks: { thumbnail: "http://books.google.com/x.jpg" },
              },
            },
            { volumeInfo: { title: "" } },
          ],
        },
      },
      seen,
    ),
  });
  const res = await g.search({ isbn: "9789861342338" });
  assert.equal(res.length, 1);
  assert.equal(res[0].isbn, "9789861342338");
  assert.equal(res[0].cover_url, "https://books.google.com/x.jpg");
  assert.equal(res[0].description, "阿德勒心理學\n第二段&結尾");
  const u = new URL(seen[0]);
  assert.equal(u.searchParams.get("q"), "isbn:9789861342338");
  assert.equal(u.searchParams.get("key"), "k");
});

test("Open Library parsing with work descriptions", async () => {
  const o = openLibrary({
    baseURL: "https://ol.test",
    coversURL: "https://covers.test",
    fetch: fakeFetch({
      "/search.json": {
        docs: [
          { key: "/works/OL1W", title: "Dune", author_name: ["Frank Herbert"], isbn: ["0441013597", "9780441013593"], cover_i: 42, subject: ["a", "b", "c", "d", "e", "f"], first_publish_year: 1965 },
          { key: "/works/OL2W", title: "Dune Messiah", author_name: ["Frank Herbert"] },
        ],
      },
      "/works/OL1W.json": { description: { type: "/type/text", value: "Desert planet." } },
      "/works/OL2W.json": { description: "Sequel." },
    }),
  });
  const res = await o.search({ title: "Dune", author: "Herbert" });
  assert.equal(res.length, 2);
  assert.equal(res[0].isbn, "9780441013593");
  assert.equal(res[0].cover_url, "https://covers.test/b/id/42-M.jpg");
  assert.equal(res[0].description, "Desert planet.");
  assert.equal(res[0].categories.length, 5);
  assert.equal(res[0].published_date, "1965");
  assert.equal(res[1].description, "Sequel.");
});

const fake = (name: string, res: unknown[] | Error): Provider => ({
  name,
  search: async () => {
    if (res instanceof Error) throw res;
    return res as never;
  },
});

test("searchAll falls back between providers", async () => {
  const B = [{ source: "google", title: "B", authors: [], categories: [] }];
  assert.equal((await searchAll([fake("a", new Error("down")), fake("b", B)], { text: "x" }))[0].title, "B");
  assert.equal((await searchAll([fake("a", []), fake("b", B)], { text: "x" })).length, 1);
  assert.deepEqual(await searchAll([fake("a", new Error("down")), fake("b", [])], { text: "x" }), []);
  await assert.rejects(searchAll([fake("a", new Error("x")), fake("b", new Error("y"))], { text: "x" }), /b: y/);
  assert.deepEqual(await searchAll([fake("a", new Error("x"))], {}), []);
});

test("best matches titles", () => {
  const res = [
    { source: "google" as const, title: "Something Else", authors: [], categories: [] },
    { source: "google" as const, title: "被討厭的勇氣", subtitle: "自我啟發之父", authors: [], categories: [] },
  ];
  assert.equal(best(res, "被討厭的勇氣：自我啟發之父「阿德勒」的教導")?.title, "被討厭的勇氣");
  assert.equal(best(res, "三體"), null);
});
