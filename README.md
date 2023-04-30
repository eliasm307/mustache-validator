# Mustache Validator

## Why?

[Mustache](https://www.npmjs.com/package/mustache) doesn't validate the data used in templates which means there is a low amount of safety when the data is managed/defined in another place or there are typos, e.g. for the following:

```js
Mustache.render("Hello, {{subject.name}}!", { subject });
```

The shape of `subject` is defined somewhere else and could change for any reason, which would break the template, but Mustache wont complain.

Unless there are tests to validate every template, there are risks that code changes could silently break templates.

This could be problematic and the aim of this package is to add data validation to Mustache template rendering.

## Why doesn't Mustache have this functionality built in?

Good question, there is an open issue [here](https://github.com/janl/mustache.js/issues/599) from 2016 and it doesn't look like its going to be added. This package will be deprecated if that ever happens.

## How it works

The aim of this is to add validation, however there should be no effect to how Mustache works and minimal effects to performance. Validation in this case means making sure properties used in templates exist in the relevant data objects, where `null`/`undefined` are valid values. If a property with the same name does not exist in the object then this is invalid.

To achieve this, the package aims to add proxies to the data objects, such that when a property is accessed its up to the object to decide whether it is valid or not.

This means the data validation is lazy and the template parsing is done once.

## Installation

```bash
npm i mustache-validator
```

or

```bash
yarn add mustache-validator
```

## Usage

The package exports a function which should be given the template data and produces a proxied version of the data, e.g.:

```js
import proxyData from "mustache-validator";
Mustache.render("Hello, {{subject.name}}!", proxyData({ subject }));
```

This will throw an error if the data is misused in the template.

If you dont want a hard error, there is an option to customise what happens instead, e.g.:

```js
import proxyData from "mustache-validator";
Mustache.render(
  "Hello, {{subject.name}}!",
  proxyData(
    { subject },
    {
      handleError: (invalidPropertyPathSegments) => {
        console.warn(`Invalid Mustache property: ${invalidPropertyPathSegments.join(".")}`);
      },
    },
  ),
);
```

## Limitations

### Invalid primitive value usages cant be validated

Since this relies on proxies, which can only be applied to objects, it means misuse of primitive values can't be validated. For example the following wouldn't cause a validation issue:

```js
Mustache.render("Hello, {{subject.name}}!", { subject: "value" });
```
