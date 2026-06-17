import { describe, expect, test } from 'bun:test';
import { BaseLLMModel } from './base';
import type { JsonArraySchema, ModelCapabilities } from './types';

class TestModel extends BaseLLMModel {
	protected modelCapabilities: ModelCapabilities;
	public constructor(caps: ModelCapabilities) {
		super();
		this.modelCapabilities = caps;
	}
}

const SCORE_SCHEMA: JsonArraySchema = {
	type: 'array',
	items: {
		type: 'object',
		properties: {
			score: { type: 'number' },
		},
	},
};

// Build an array schema loosely so these math tests don't each re-trigger the BUG #3 type
// error — SCORE_SCHEMA above is the single canonical signal for that.
function arraySchema(items: unknown): JsonArraySchema {
	return { type: 'array', items } as unknown as JsonArraySchema;
}

describe('BaseLLMModel', () => {
	test('estimates prompt size at ~4 chars per token', () => {
		const model = new TestModel({ maxInputTokens: 100, maxOutputTokens: 100 });
		expect(model.calculatePromptSize('12345678')).toBe(2);
	});

	test('isWithinTokenLimit respects maxInputTokens', () => {
		const model = new TestModel({ maxInputTokens: 2, maxOutputTokens: 100 });
		expect(model.isWithinTokenLimit('12345678')).toBe(true); // 8 chars -> 2 tokens
		expect(model.isWithinTokenLimit('x'.repeat(12))).toBe(false); // 12 chars -> 3 tokens
	});

	test('computeBatchBudget reserves margins and returns positive budgets', () => {
		const model = new TestModel({ maxInputTokens: 1000, maxOutputTokens: 1000 });
		const budget = model.computeBatchBudget('x'.repeat(40), SCORE_SCHEMA);
		expect(budget.availableInputTokens).toBeGreaterThan(0);
		expect(budget.availableInputTokens).toBeLessThan(1000);
		expect(budget.maxItemsByOutput).toBeGreaterThan(0);
	});

	test('computeBatchBudget throws when the fixed prompt exceeds the input budget', () => {
		const model = new TestModel({ maxInputTokens: 1, maxOutputTokens: 1000 });
		expect(() => model.computeBatchBudget('x'.repeat(400), SCORE_SCHEMA)).toThrow(
			'Fixed prompt exceeds available input token budget',
		);
	});

	test('computeBatchBudget never returns a zero per-batch item cap', () => {
		const model = new TestModel({ maxInputTokens: 1000, maxOutputTokens: 10 });
		const budget = model.computeBatchBudget('hi', SCORE_SCHEMA);
		console.log({ budget });
		expect(budget.maxItemsByOutput).toBeGreaterThanOrEqual(1);
	});
});

describe('BaseLLMModel.computeBatchBudget — exact math', () => {
	test('availableInputTokens = maxInput - instructionSize - 10% input margin', () => {
		const model = new TestModel({ maxInputTokens: 1000, maxOutputTokens: 1000 });
		// instructions: 40 chars -> ceil(40/4) = 10 tokens; input margin: ceil(1000 * 0.1) = 100
		const budget = model.computeBatchBudget('x'.repeat(40), arraySchema({ type: 'number' }));
		expect(budget.availableInputTokens).toBe(1000 - 10 - 100);
	});

	test('maxItemsByOutput = floor((maxOutput - 15% margin) / per-item estimate)', () => {
		const model = new TestModel({ maxInputTokens: 100_000, maxOutputTokens: 1000 });
		// output margin: ceil(1000 * 0.15) = 150 -> available 850; number estimate = 5
		const budget = model.computeBatchBudget('hi', arraySchema({ type: 'number' }));
		expect(budget.maxItemsByOutput).toBe(Math.floor(850 / 5)); // 170
	});

	// Pins estimateSchemaTokens (private) for each schema shape via the resulting item cap.
	// available output tokens here are always 850 (maxOutput 1000 - 15% margin).
	const ESTIMATE_CASES: Array<[string, unknown, number]> = [
		['boolean leaf', { type: 'boolean' }, 5],
		['number leaf', { type: 'number' }, 5],
		['string leaf', { type: 'string' }, 50],
		['unknown leaf', { type: 'mystery' }, 20],
		[
			'object: 6/key + 2 braces + members',
			{ type: 'object', properties: { a: { type: 'number' }, b: { type: 'string' } } },
			6 * 2 + 2 + 5 + 50,
		],
		['array: item * 2 + 2 brackets', { type: 'array', items: { type: 'number' } }, 5 * 2 + 2],
		['empty array: flat 10', { type: 'array' }, 10],
	];
	for (const [label, itemSchema, estimate] of ESTIMATE_CASES) {
		test(`per-item output estimate — ${label}`, () => {
			const model = new TestModel({ maxInputTokens: 100_000, maxOutputTokens: 1000 });
			const budget = model.computeBatchBudget('hi', arraySchema(itemSchema));
			expect(budget.maxItemsByOutput).toBe(Math.floor(850 / estimate));
		});
	}

	test('object estimate recurses through nested properties', () => {
		const model = new TestModel({ maxInputTokens: 100_000, maxOutputTokens: 1000 });
		// inner object: 6*1 + 2 + number(5) = 13; outer object: 6*1 + 2 + 13 = 21
		const budget = model.computeBatchBudget(
			'hi',
			arraySchema({
				type: 'object',
				properties: { nested: { type: 'object', properties: { score: { type: 'number' } } } },
			}),
		);
		expect(budget.maxItemsByOutput).toBe(Math.floor(850 / 21));
	});
});
