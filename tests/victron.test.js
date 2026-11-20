// Unit tests for the logic in customize/victron.js that needs no Weblate:
// how the Filters menu rewrites a query, and how search matches are found.
// Run: node --test 'tests/*.test.js'
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

// victron.js is a browser script; outside a page it only needs somewhere to
// register its event listeners.
const window = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../customize/victron.js"), "utf8"), {
	window: Object.assign(window, { addEventListener() {} }),
	document: { addEventListener() {} },
});
// Arrays made in the script's context fail deepStrictEqual on their prototype.
const plain = (fn) => (...args) => JSON.parse(JSON.stringify(fn(...args)));
const { rescope } = window.vtSearch;
const targetWords = plain(window.vtSearch.targetWords);
const textMatches = plain(window.vtSearch.textMatches);

test("rescope: bare words get the scope", () => {
	assert.equal(rescope("ev", "source"), "source:ev");
	assert.equal(rescope("ev", "target"), "target:ev");
	assert.equal(rescope('"two words" has:check', "source"), 'source:"two words" has:check');
});

test("rescope: source: and target: change scope, or lose it for everywhere", () => {
	assert.equal(rescope("source:ev", "target"), "target:ev");
	assert.equal(rescope("source:ev", ""), "ev");
});

test("rescope: other fields stay as they are", () => {
	assert.equal(rescope("state:>=translated device", "target"), "state:>=translated target:device");
});

test("rescope: AND, OR and NOT stay operators, in any case", () => {
	assert.equal(rescope("battery or inverter", "target"), "target:battery or target:inverter");
	assert.equal(rescope("battery OR Not inverter", "source"), "source:battery OR Not source:inverter");
	assert.equal(rescope("a And b", "source"), "source:a And source:b");
});

test("rescope: groups keep their parentheses", () => {
	assert.equal(rescope("(source:foo OR target:bar)", "source"), "(source:foo OR source:bar)");
});

test("rescope: exact matches and regular expressions keep their operator", () => {
	assert.equal(rescope('target:="hello world"', "source"), 'source:="hello world"');
	assert.equal(rescope('source:r"^EV"', "target"), 'target:r"^EV"');
});

test("rescope: date ranges, escaped quotes and URLs are one value each", () => {
	assert.equal(rescope("added:[2026-01-01 to 2026-02-01] battery", "source"), "added:[2026-01-01 to 2026-02-01] source:battery");
	assert.equal(rescope('target:"Press \\"OK\\" now"', "source"), 'source:"Press \\"OK\\" now"');
	assert.equal(rescope("https://example.com", "target"), "target:https://example.com");
});

test("rescope: a field may have spaces around its colon", () => {
	assert.equal(rescope("state: translated battery", "source"), "state: translated source:battery");
	assert.equal(rescope('context: "two words" battery', "target"), 'context: "two words" target:battery');
	assert.equal(rescope("source : battery", "target"), "target:battery");
});

test("rescope: everywhere quotes a value that would read as query syntax", () => {
	assert.equal(rescope("target:state:empty", ""), '"state:empty"');
	assert.equal(rescope("target:or", ""), '"or"');
	assert.equal(rescope('target:"two words"', ""), '"two words"');
});

test("rescope: a query it can't rewrite is left alone (null)", () => {
	assert.equal(rescope("source:(foo OR bar)", "target"), null); // a field over a group
	assert.equal(rescope('target:="hello world"', ""), null); // exact needs a field
	assert.equal(rescope('source:r"^EV"', ""), null); // so does a regex
	assert.equal(rescope("state:empty", "source"), null); // no word to scope
	assert.equal(rescope("", "source"), null);
});

test("targetWords: bare words and target: values, not source: or regexes", () => {
	assert.deepEqual(targetWords('ev source:x target:"two words" or target:r"y" state:empty'), ["ev", "two words"]);
});

test("targetWords: escaped quotes are the quote itself; a URL is a word", () => {
	assert.deepEqual(targetWords('target:"Press \\"OK\\""'), ['Press "OK"']);
	assert.deepEqual(targetWords("https://example.com"), ["https://example.com"]);
});

test("textMatches: finds every match, ignoring case", () => {
	assert.deepEqual(textMatches("Lynx Shunt niet gevonden", ["ev"]), [[17, 19]]);
	assert.deepEqual(textMatches("EV ev Ev", ["ev"]), [[0, 2], [3, 5], [6, 8]]);
});

test("textMatches: offsets fit the original text, also where lowercasing changes its length", () => {
	const text = "İfoo İFOO bar";
	const matches = textMatches(text, ["foo"]);
	assert.deepEqual(matches, [[1, 4], [6, 9]]);
	for (const [, end] of matches) assert.ok(end <= text.length);
});

test("textMatches: search words are literal text, not patterns", () => {
	assert.deepEqual(textMatches("a.b axb", ["a.b"]), [[0, 3]]);
	assert.deepEqual(textMatches("(1+1)", ["1+1"]), [[1, 4]]);
});
