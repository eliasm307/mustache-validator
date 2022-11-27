import fs from 'fs';
import path from 'path';
import mustache from 'mustache';
import createDataProxy, {Options} from '.';

/**
 * Data validation shouldn't significantly affect performance
 * so we set this hard boundary for how much extra time the validation should add
 *
 * @remark timings can vary wildly and using a relative percentage would be too sensitive for very small times
 */
const MAX_TIME_DIFFERENCE_MS = 5;

type JSONValue =
  | string
  | number
  | null
  | {[key: string]: JSONValue;}
  | JSONValue[];

function formatSpecData(data: string | Record<string, JSONValue>): string | Record<string, JSONValue> {
  if (!data || typeof data !== 'object') {
    return data;
  }
  const formattedEntries = Object
    .entries(data)
    .map(([key, value]: [string, any]) => {
      const isFunctionPlaceholder = value && typeof value === 'object' && value.__tag__ === "code" && typeof value.js === 'string';
      if (isFunctionPlaceholder) {
        value = new Function(`return ${value.js}`)();
      }
      return [key, value];
    });
  return Object.fromEntries(formattedEntries);
};

type AssertTemplateIsValidConfig = {
  template: string,
  data: string | Record<string, any>,
  partials?: Record<string, any>,
  caseName?: string;
  options?: Options;
};

function renderWithAndWithoutValidation({template, data, partials, caseName, options}: AssertTemplateIsValidConfig) {
  // test render with data proxy (first incase it throws)
  let formattedData = formatSpecData(data);
  const proxiedData = createDataProxy(formattedData, options);
  let validatedTimeMs = performance.now();
  const outputWithProxy = mustache.render(template, proxiedData, partials);
  validatedTimeMs = performance.now() - validatedTimeMs;

  // reset for next mustache run
  mustache.clearCache();
  if (caseName === 'Interpolation - Multiple Calls') {
    delete globalThis.calls; // test saves multiple calls in global object, need to clear this between runs
  }

  // test normal render
  formattedData = formatSpecData(data); // re-formatting so we are working with new data, just incase
  let rawTimeMs = performance.now();
  const outputNormal = mustache.render(template, formattedData, partials);
  rawTimeMs = performance.now() - rawTimeMs;

  // output shouldn't be affected
  expect(outputNormal).toEqual(outputWithProxy);

  // make sure performance not significantly affected
  const deltaMs = validatedTimeMs - rawTimeMs;
  if (deltaMs > MAX_TIME_DIFFERENCE_MS) {
    const deltaPercent = `${deltaMs * 100 / rawTimeMs}%`;
    console.warn("high time delta, proxy has affected performance", {
      rawTimeMs,
      validatedTimeMs,
      deltaMs,
      deltaPercent,
      outputNormal,
      outputWithProxy
    });
    throw Error(`High time difference, proxy has affected performance and added "${deltaMs}ms" to rendering`);
  }
}

beforeEach(() => {
  mustache.clearCache();
});

describe('valid mustache spec cases', () => {

  const SPECS_DIR = path.join(__dirname, "../mustache-spec/specs");

  interface SpecData {
    fileName: string,
    overview: string,
    tests: {
      name: string,
      desc: string,
      data: Record<string, any>,
      template: string,
      partials?: Record<string, any>;
    }[];
  }

  const SPEC_FILES_TO_SKIP = [
    "~inheritance.json" // JS mustache implementation doesn't seem to support this
  ];

  function loadSpecs(): SpecData[] {
    return fs
      .readdirSync(SPECS_DIR,)
      .filter(specFile => specFile.endsWith(".json") && !SPEC_FILES_TO_SKIP.includes(specFile))
      .map(jsonSpecFileName => {
        const jsonSpecFilePath = path.join(SPECS_DIR, jsonSpecFileName);
        const rawSpecString = fs.readFileSync(jsonSpecFilePath, {encoding: 'utf-8'});
        return {...JSON.parse(rawSpecString), fileName: jsonSpecFileName} as SpecData;
      });
  }

  const SPEC_TEST_CASE_NAME_TO_EXPECTED_FAILURE_MESSAGE_MAP: Record<string, Record<string, string | undefined> | undefined> = {
    "sections.json": {
      'Context Misses': "Missing Mustache data property: missing",
      "Deeply Nested Contexts": "Missing Mustache data property: a > b",
      "List Contexts": "Missing Mustache data property: tops > 0 > middles > 0 > tname",
      "Parent contexts": "Missing Mustache data property: sec > a",
      "Dotted Names - Broken Chains": "Missing Mustache data property: a > b",
    },
    "inverted.json": {
      "Dotted Names - Broken Chains": "Missing Mustache data property: a > b",
      'Context Misses': "Missing Mustache data property: missing",
    },
    "interpolation.json": {
      "Basic Context Miss Interpolation": "Missing Mustache data property: cannot",
      "Triple Mustache Context Miss Interpolation": "Missing Mustache data property: cannot",
      "Dotted Names - Broken Chains": "Missing Mustache data property: a > b",
      "Ampersand Context Miss Interpolation": "Missing Mustache data property: cannot",
      "Dotted Names - Broken Chain Resolution": "Missing Mustache data property: a > b > c",
      "Dotted Names - Context Precedence": "Missing Mustache data property: a > b > c",
    }
  };

  loadSpecs().forEach(spec => {

    describe(spec.fileName, () => {

      spec.tests.forEach((testCase) => {
        const {data, desc, name, template, partials} = testCase;
        const testDescription = `${name} > ${desc}`;

        const expectedFailureMessage = SPEC_TEST_CASE_NAME_TO_EXPECTED_FAILURE_MESSAGE_MAP[spec.fileName]?.[name];
        if (expectedFailureMessage) {
          it(testDescription, () => {
            const assertion = () => renderWithAndWithoutValidation({template, data, partials, caseName: name});
            expect(assertion).toThrow(expectedFailureMessage);
          });
          return;
        }

        it(testDescription, () => {
          renderWithAndWithoutValidation({template, data, partials, caseName: name});
        });

      });

    });

  });

});

describe('mustache-validator', () => {

  it('does not consider valid case invalid', () => {
    const assertion = () => renderWithAndWithoutValidation({
      template: "Hello, {{subject.name}}!\n",
      data: {subject: {name: "world"}}
    });
    expect(assertion).not.toThrow();
  });

  it('does not consider explicit undefined value invalid', () => {
    const assertion = () => renderWithAndWithoutValidation({
      template: "Hello, {{subject.name}}!\n",
      data: {subject: {name: undefined}}
    });
    expect(assertion).not.toThrow();
  });

  it('considers implicit undefined value invalid', () => {
    const assertion = () => renderWithAndWithoutValidation({
      template: "Hello, {{subject.name}}!\n",
      data: {subject: {}}
    });
    expect(assertion).toThrow("Missing Mustache data property: subject > name");
  });

  it('considers missing leaf property invalid', () => {
    const assertion = () => renderWithAndWithoutValidation({
      template: "Hello, {{subject.name}}!\n",
      data: {subject: {names: "world"}}
    });
    expect(assertion).toThrow("Missing Mustache data property: subject > name");
  });

  it('considers missing root property invalid', () => {
    const assertion = () => renderWithAndWithoutValidation({
      template: "Hello, {{subject.name}}!\n",
      data: {subjects: {name: "world"}}
    });
    expect(assertion).toThrow("Missing Mustache data property: subject");
  });

  /*
  NOTE: Ideally this should throw however since its not possible to proxy primitive values or create a proxy that is not `typeof` "object"
  we cannot know or enforce how the primitives the data proxy produces are used
  */
  it.skip('considers incorrect data shape invalid', () => {
    const assertion = () => renderWithAndWithoutValidation({
      template: "Hello, {{subject.name}}!\n",
      data: {subject: "world"}
    });
    expect(assertion).toThrow('tbc');
  });

  it('allows error handling to be customised', () => {
    const assertion = () => renderWithAndWithoutValidation({
      template: "Hello, {{subject.name}}!\n",
      data: {subject: {names: "world"}},
      options: {
        handleError(invalidPropertyPathSegments) {
          throw Error(`Custom error: ${invalidPropertyPathSegments.join(".")}`);
        },
      }
    });
    expect(assertion).toThrow("Custom error: subject.name");
  });

  it('allows error handling to be customised, without throwing an error', () => {
    const mock = jest.fn();
    renderWithAndWithoutValidation({
      template: "Hello, {{subject.name}}!\n",
      data: {subject: {names: "world"}},
      options: {
        handleError(invalidPropertyPathSegments) {
          mock(invalidPropertyPathSegments.join("."));
        },
      }
    });
    ;
    expect(mock.mock.calls.length).toEqual(1);
    expect(mock.mock.calls[0][0]).toEqual("subject.name");
  });

});