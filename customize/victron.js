/*
 * Victron Translations: project, component and language lists, and a
 * translation's string status table, as tiles.
 *
 * Loaded through WEBLATE_EXTRA_HTML_HEAD next to victron.css. Weblate renders
 * these lists as a table with two rows per entry (numbers, then the progress
 * bar). This moves the bar into the first row and marks the table, so
 * victron.css can lay the rows out as tiles. Without this script the table
 * stays as Weblate renders it.
 *
 * Only tables where every entry links to a project, component or language
 * (/projects/... or /languages/...) are changed; other tables stay. A list of
 * more than COMPACT entries (the 40 languages) gets smaller tiles.
 */
(() => {
	const ENTRY = /^\/(projects|languages)\//;
	const COMPACT = 8;

	function tile(table) {
		if (table.classList.contains("vt-tiles")) return;
		const body = table.tBodies[0];
		if (!body) return;
		const rows = [...body.rows].filter((r) => r.id && r.querySelector(".object-link a"));
		if (!rows.length) return;
		if (!rows.every((r) => ENTRY.test(r.querySelector(".object-link a").getAttribute("href")))) return;

		const heads = table.tHead ? [...table.tHead.rows[0].cells] : [];
		for (const row of rows) {
			const name = row.querySelector(".object-link");
			const bar = body.querySelector(`tr[data-parent="${CSS.escape(row.id)}"]`);
			if (bar) {
				const stack = bar.querySelector(".progress-stacked");
				if (stack) name.append(stack);
				bar.remove();
			}
			for (const cell of row.cells) {
				const head = heads[cell.cellIndex];
				if (head) cell.dataset.label = head.textContent.trim();
			}
			// What a tile shows: translated, unfinished and suggestions.
			const translated = row.querySelector('td.number:not([class*="zero-width"])');
			const unfinished = row.querySelector('td.number a[href*="state:<translated"]')?.closest("td");
			const suggestions = row.querySelector('td.number a[href*="has:suggestion"]')?.closest("td");
			for (const cell of [translated, unfinished, suggestions]) cell?.classList.add("vt-show");
		}
		table.classList.add("vt-tiles");
		if (rows.length > COMPACT) table.classList.add("vt-compact");
	}

	// A translation's string status table (All strings, Approved, Failing check: ...):
	// one tile per row. The row itself already opens the strings (Weblate's
	// clickable-row); the words and characters columns get their heading as label.
	function statusTiles(table) {
		if (table.classList.contains("vt-tiles")) return;
		const body = table.tBodies[0];
		if (!body || !body.rows.length) return;
		if (![...body.rows].every((r) => r.classList.contains("clickable-row") && r.querySelector("td.legend"))) return;
		const heads = table.tHead ? [...table.tHead.querySelectorAll("th.number span")].map((s) => s.textContent.trim()) : [];
		for (const row of body.rows) {
			row.querySelectorAll("th.number span").forEach((span, i) => {
				if (heads[i]) span.dataset.label = heads[i];
			});
		}
		table.classList.add("vt-tiles", "vt-status");
	}

	function run(root) {
		root.querySelectorAll?.("table.progress-table").forEach(tile);
		root.querySelectorAll?.("table.table-listing").forEach(statusTiles);
	}

	document.addEventListener("DOMContentLoaded", () => {
		run(document);
		// Dashboard tabs and "load more" add tables later.
		new MutationObserver((changes) => {
			for (const change of changes) change.addedNodes.forEach((node) => node.nodeType === 1 && run(node));
		}).observe(document.body, { childList: true, subtree: true });
	});
})();

/*
 * Zen mode: translation memory for an empty translation.
 *
 * Weblate shows matches from its translation memory and from the other strings
 * only in the full editor ("Automatic suggestions"). In Zen, an empty field
 * that gets the focus asks the same two services and lists the matches under
 * it; a click puts one in the field, which Weblate saves when you leave it
 * (the buttons use Weblate's own data-clone-value). Machine translation is
 * left to the full editor. Without this script Zen works as before.
 */
(() => {
	const SERVICES = ["weblate-translation-memory", "weblate"];
	const MAX = 4;
	const cache = new Map();

	async function matches(form) {
		const unit = form.querySelector("[name=unit_id]")?.value;
		const token = form.querySelector("[name=csrfmiddlewaretoken]")?.value;
		if (!unit || !token) return [];
		if (!cache.has(unit)) {
			const requests = SERVICES.map((service) =>
				fetch(`/js/translate/${service}/${unit}/`, {
					method: "POST",
					credentials: "same-origin",
					headers: { "X-Requested-With": "XMLHttpRequest", Accept: "application/json" },
					body: new URLSearchParams({ csrfmiddlewaretoken: token }),
				})
					.then((response) => response.json())
					.then((data) => data.translations || [])
					.catch(() => []),
			);
			cache.set(
				unit,
				Promise.all(requests).then((lists) => {
					const best = new Map();
					for (const match of lists.flat()) {
						if (match.plural_form) continue;
						const seen = best.get(match.text);
						if (!seen || match.quality > seen.quality) best.set(match.text, match);
					}
					return [...best.values()].sort((a, b) => b.quality - a.quality).slice(0, MAX);
				}),
			);
		}
		return cache.get(unit);
	}

	function clear(cell) {
		cell.querySelector(".vt-memory")?.remove();
	}

	async function show(editor) {
		const cell = editor.closest(".zen-unit .translator");
		const form = editor.closest("form");
		if (!cell || !form || form.querySelectorAll(".translation-editor").length !== 1) return;
		if (editor.value.trim() !== "") return clear(cell);
		if (cell.querySelector(".vt-memory")) return;
		const found = await matches(form);
		if (!found.length || editor.value.trim() !== "" || cell.querySelector(".vt-memory")) return;
		const box = document.createElement("div");
		box.className = "vt-memory";
		for (const match of found) {
			const button = document.createElement("button");
			button.type = "button";
			button.dataset.cloneValue = match.text;
			button.title = `${match.source} (${match.origin || match.service})`;
			button.append(match.text);
			const quality = document.createElement("small");
			quality.textContent = `${match.quality}%`;
			button.append(quality);
			// After Weblate's own click handler, which finds the field from the button
			// but not its form: a copied match needs editing, as in Weblate's editor.
			button.addEventListener("click", () =>
				setTimeout(() => {
					window.WLT?.Utils?.markFuzzy(form);
					box.remove();
					editor.focus();
				}),
			);
			box.append(button);
		}
		cell.append(box);
	}

	for (const type of ["focusin", "input"]) {
		document.addEventListener(type, (event) => {
			if (event.target.matches?.("table.zen .translation-editor")) show(event.target);
		});
	}
	// Weblate gives the first string the focus as the page loads, before this runs.
	window.addEventListener("load", () => {
		if (document.activeElement?.matches?.("table.zen .translation-editor")) show(document.activeElement);
	});
})();

/* The search field of the translate and Zen pages says what it is for. */
document.addEventListener("DOMContentLoaded", () => {
	const query = document.querySelector(".js-editor #id_q");
	if (query) query.placeholder = window.gettext ? gettext("Search") : "Search";
});

/*
 * Search on the translate and Zen pages: where a word is looked for.
 *
 * A plain word is searched in the English text, the translation, the context
 * and the comments, but Weblate marks the match in the English text only, so
 * a string that matches in its translation looks like a wrong result. This
 * marks the match in the translation too (CSS Custom Highlight API: nothing in
 * Weblate's own markup changes; browsers without it show no mark).
 *
 * It also adds three entries to the Filters menu to search everywhere, in the
 * English text only or in the translation only, so nobody has to know the
 * "source:" and "target:" prefixes; they rewrite the query and run it.
 */
(() => {
	// One part of a query, as Weblate's parser (weblate/utils/search.py) sees
	// it: a parenthesis, a field with its operator and value (source:foo,
	// target:="two \"words\"", added:[2026-01-01 to 2026-02-01]), or a bare
	// word or quoted phrase. A URL is a word, not a field "https". Weblate
	// allows spaces around the colon ("state: translated"). Its AND, OR and
	// NOT are bare words, in any case.
	const QUOTED = String.raw`r?"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'`;
	const TOKEN = new RegExp(
		String.raw`(\()|(\))|(?!http|ftp|mailto)([a-z_]+)\s*:(=|<=|>=|<|>)?\s*(\[[^\]]*\]|${QUOTED}|[^\s()]*)|(${QUOTED}|[^\s()]+)`,
		"gi",
	);
	const OPERATOR = /^(and|or|not)$/i;
	const SCOPES = [
		["", "Search everywhere"],
		["source", "Search the English text only"],
		["target", "Search the translation only"],
	];

	function parts(query) {
		return [...query.matchAll(TOKEN)].map((m) => ({
			start: m.index,
			end: m.index + m[0].length,
			field: m[3]?.toLowerCase() ?? null,
			operator: m[4] ?? "",
			value: m[5] ?? m[6] ?? "",
			bare: m[6] !== undefined && !OPERATOR.test(m[6]),
		}));
	}

	// A word that says what to look for: bare, or with source: or target:.
	const isText = (part) => part.bare || part.field === "source" || part.field === "target";
	// A value as it reads without its field: quoted where it would read as
	// query syntax ("target:state:empty" is the text, "state:empty" a filter).
	function literal(value) {
		const [part, ...more] = parts(value);
		return part?.bare && !more.length && part.end === value.length ? value : `"${value.replace(/["\\]/g, "\\$&")}"`;
	}

	const unquote = (value) => value.replace(/^(["'])(.*)\1$/, "$2").replace(/\\(["'\\])/g, "$1");

	// The query with its words in one scope ("" is everywhere), or null when it
	// can't be said that way: a field over a group, "source:(a OR b)", or an
	// exact or regular-expression match, which only a field can carry.
	function rescope(query, scope) {
		let out = "";
		let last = 0;
		let changed = false;
		for (const part of parts(query)) {
			if (!isText(part)) continue;
			if (part.field && !part.value) return null;
			const special = part.operator || part.value.startsWith('r"');
			if (!scope && special) return null;
			out += query.slice(last, part.start) + (scope ? `${scope}:${part.operator}${part.value}` : literal(part.value));
			last = part.end;
			changed = true;
		}
		return changed ? out + query.slice(last) : null;
	}

	// The words to mark in a translation: bare ones and those of "target:".
	function targetWords(query) {
		return parts(query)
			.filter((part) => (part.bare || part.field === "target") && !part.value.startsWith('r"'))
			.map((part) => unquote(part.value))
			.filter(Boolean);
	}

	const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

	// [start, end] of each match of the words in a text, ignoring case. Matched
	// in the text itself, not a lowercased copy: lowercasing can change a
	// text's length ("İ"), and the offsets must fit its nodes.
	function textMatches(text, words) {
		return words.flatMap((word) =>
			[...text.matchAll(new RegExp(escape(word), "giu"))].map((m) => [m.index, m.index + m[0].length]),
		);
	}

	// For tests/victron.test.js.
	window.vtSearch = { rescope, targetWords, textMatches };

	function mark(words) {
		const ranges = [];
		for (const output of document.querySelectorAll(".js-editor .highlighted-output")) {
			if (output.closest(".query-field")) continue;
			// A match can cross Weblate's own spans (a marked space, a placeholder).
			const nodes = [];
			const walker = document.createTreeWalker(output, NodeFilter.SHOW_TEXT);
			let text = "";
			for (let node = walker.nextNode(); node; node = walker.nextNode()) {
				nodes.push([text.length, node]);
				text += node.data;
			}
			const at = (offset, end) => {
				let found = nodes[0];
				for (const entry of nodes) {
					if (entry[0] < offset || (!end && entry[0] === offset)) found = entry;
					else break;
				}
				return [found[1], offset - found[0]];
			};
			for (const [start, end] of textMatches(text, words)) {
				const range = new Range();
				range.setStart(...at(start, false));
				range.setEnd(...at(end, true));
				ranges.push(range);
			}
		}
		CSS.highlights.set("vt-search", new Highlight(...ranges));
	}

	function scopeMenu(query) {
		const menu = query.closest(".query-field")?.querySelector(".dropdown-menu");
		if (!menu) return;
		const divider = document.createElement("li");
		divider.innerHTML = '<hr class="dropdown-divider">';
		menu.append(divider);
		for (const [scope, label] of SCOPES) {
			const item = document.createElement("li");
			// A button: Weblate's own handler takes every link in this menu.
			const button = document.createElement("button");
			button.type = "button";
			button.className = "dropdown-item vt-scope";
			button.textContent = label;
			button.addEventListener("click", () => {
				const words = parts(query.value).filter(isText);
				const rewritten = rescope(query.value, scope);
				if (rewritten !== null) {
					query.value = rewritten;
					query.form.submit();
				} else if (!words.length) {
					// No word yet: start one, for the translator to finish.
					query.value = `${query.value.trim()} ${scope ? `${scope}:` : ""}`.trimStart();
					query.focus();
					query.dispatchEvent(new Event("input", { bubbles: true }));
				} else {
					// Leave a query this can't rewrite as it is, rather than change its meaning.
					window.addAlert?.("This search can't be changed from the menu; edit it in the search field.", "info");
					query.focus();
				}
			});
			item.append(button);
			menu.append(item);
		}
	}

	document.addEventListener("DOMContentLoaded", () => {
		const query = document.querySelector(".js-editor #id_q");
		if (!query) return;
		scopeMenu(query);
		const words = targetWords(query.value);
		if (!words.length || !window.Highlight || !CSS.highlights) return;
		// Weblate redraws a translation's text while you type, and Zen loads more strings.
		let pending = 0;
		const refresh = () => {
			cancelAnimationFrame(pending);
			pending = requestAnimationFrame(() => mark(words));
		};
		new MutationObserver(refresh).observe(document.querySelector(".js-editor"), { childList: true, subtree: true, characterData: true });
		refresh();
	});
})();

/*
 * Zen mode: the screenshots of the string you edit.
 *
 * Zen shows no screenshots; the full editor does, beside the string. For the
 * string that has the focus, this fetches that string's page in the full
 * editor (its permalink, so Weblate checks access as usual) and shows its
 * screenshots as small images under the context; a click shows one large.
 * Pointing at a string fetches them ahead, so they are there on a click.
 */
(() => {
	const cache = new Map();

	function screenshots(unit) {
		const link = unit.querySelector('tr[id^="row-status-"] [data-clipboard-value]')?.getAttribute("href");
		if (!link) return Promise.resolve([]);
		// The permalink carries the configured site domain; the page may be open
		// under another name, and a fetch there goes without the session.
		const { pathname, search } = new URL(link, location.href);
		const url = pathname + search;
		if (!cache.has(url)) {
			cache.set(
				url,
				fetch(url, { credentials: "same-origin" })
					.then((response) => (response.ok ? response.text() : ""))
					.then((html) =>
						[...new DOMParser().parseFromString(html, "text/html").querySelectorAll("a.thumbnail[data-details-url] img")].map(
							(img) => ({ src: img.getAttribute("src"), name: img.getAttribute("alt") || "" }),
						),
					)
					.catch(() => []),
			);
		}
		return cache.get(url);
	}

	function enlarge(shot) {
		let dialog = document.querySelector("dialog.vt-shot-dialog");
		if (!dialog) {
			dialog = document.createElement("dialog");
			dialog.className = "vt-shot-dialog";
			dialog.append(document.createElement("img"), document.createElement("p"));
			dialog.addEventListener("click", () => dialog.close());
			document.body.append(dialog);
		}
		dialog.querySelector("img").src = shot.src;
		dialog.querySelector("img").alt = shot.name;
		dialog.querySelector("p").textContent = shot.name;
		dialog.showModal();
	}

	async function show(unit) {
		for (const other of document.querySelectorAll(".zen-unit.vt-active")) {
			if (other !== unit) other.classList.remove("vt-active");
		}
		unit.classList.add("vt-active");
		const cell = unit.querySelector('tr[id^="row-status-"] > td');
		if (!cell || cell.querySelector(".vt-shots")) return;
		const found = await screenshots(unit);
		if (!found.length || cell.querySelector(".vt-shots")) return;
		const strip = document.createElement("div");
		strip.className = "vt-shots";
		for (const shot of found) {
			const button = document.createElement("button");
			button.type = "button";
			button.title = shot.name;
			// Keep the focus in the translation, so the string stays the active one.
			button.addEventListener("mousedown", (event) => event.preventDefault());
			button.addEventListener("click", () => enlarge(shot));
			const img = document.createElement("img");
			img.src = shot.src;
			img.alt = shot.name;
			img.loading = "lazy";
			button.append(img);
			strip.append(button);
		}
		cell.append(strip);
	}

	document.addEventListener("focusin", (event) => {
		const unit = event.target.closest?.("table.zen .zen-unit");
		if (unit) show(unit);
	});
	// Weblate gives the first string the focus as the page loads, before this runs.
	window.addEventListener("load", () => {
		const unit = document.activeElement?.closest?.("table.zen .zen-unit");
		if (unit) show(unit);
	});

	let timer = 0;
	document.addEventListener("mouseover", (event) => {
		const unit = event.target.closest?.("table.zen .zen-unit");
		clearTimeout(timer);
		if (unit) timer = setTimeout(() => screenshots(unit), 300);
	});
})();
