const PathSymbol = Symbol("MustacheDataPath");

function createPropertyPathArray({
  target,
  propertyName,
}: {
  target: any;
  propertyName: string | symbol;
}): any[] {
  return [...(target[PathSymbol] || []), propertyName];
}

export type Options = {
  handleError: (invalidPropertyPathSegments: string[]) => void;
};

export default function proxyMustacheData<D extends Record<string, any> | string>(
  data: D,
  options?: Options,
): D {
  if (typeof data !== "object") {
    return data;
  }
  return new Proxy(data, {
    get(target, propertyName: string) {
      let value = target[propertyName];
      if (value === undefined && !(propertyName in target)) {
        const pathSegments = createPropertyPathArray({target, propertyName});
        if (options?.handleError) {
          options.handleError(pathSegments);
          return value;
        }
        throw Error(`Missing Mustache data property: ${pathSegments.join(" > ")}`);
      }

      if (value && typeof value === "object") {
        value[PathSymbol] = createPropertyPathArray({target, propertyName});
        return proxyMustacheData(value, options);
      }

      return value;
    },
  });
}
