// @flow
import { createMacro } from 'babel-plugin-macros'
import { addDefault, addNamed } from '@babel/helper-module-imports'
import { transformExpressionWithStyles, getStyledOptions } from './utils'

function addImport(
  state: any,
  importPath: string,
  imported: string,
  nameHint?: string
) {
  let cacheKey = ['import', importPath, imported].join(':')
  if (state[cacheKey] === undefined) {
    let importIdentifier
    if (imported === 'default') {
      importIdentifier = addDefault(state.file.path, importPath, { nameHint })
    } else {
      importIdentifier = addNamed(state.file.path, imported, importPath, {
        nameHint
      })
    }
    state[cacheKey] = importIdentifier.name
  }
  return {
    type: 'Identifier',
    name: state[cacheKey]
  }
}

export let styledTransformer = ({
  state,
  babel,
  importPath,
  reference,
  options: { baseImportPath, isWeb }
}: Object) => {
  let getStyledIdentifier = () => {
    return addImport(state, baseImportPath, 'default', 'styled')
  }
  let getOriginalImportPathStyledIdentifier = () => {
    return addImport(state, importPath, 'default', 'styled')
  }
  let t = babel.types
  let isCall = false
  if (
    t.isMemberExpression(reference.parent) &&
    reference.parent.computed === false
  ) {
    isCall = true
    if (
      // checks if the first character is lowercase
      // becasue we don't want to transform the member expression if
      // it's in primitives/native
      reference.parent.property.name.charCodeAt(0) > 96
    ) {
      reference.parentPath.replaceWith(
        t.callExpression(getStyledIdentifier(), [
          t.stringLiteral(reference.parent.property.name)
        ])
      )
    } else {
      reference.replaceWith(getStyledIdentifier())
    }
  } else if (
    reference.parentPath &&
    reference.parentPath.parentPath &&
    t.isCallExpression(reference.parentPath) &&
    reference.parent.callee === reference.node
  ) {
    isCall = true
    reference.replaceWith(getStyledIdentifier())
  } else {
    reference.replaceWith(getOriginalImportPathStyledIdentifier())
  }
  if (reference.parentPath && reference.parentPath.parentPath) {
    const styledCallPath = reference.parentPath.parentPath
    let { node } = transformExpressionWithStyles({
      path: styledCallPath,
      state,
      babel,
      shouldLabel: false
    })
    if (node && isWeb) {
      // we know the argument length will be 1 since that's the only time we will have a node since it will be static
      styledCallPath.node.arguments[0] = node
    }
  }

  if (isCall) {
    reference.addComment('leading', '#__PURE__')
    if (isWeb) {
      reference.parentPath.node.arguments[1] = getStyledOptions(
        t,
        reference.parentPath,
        state
      )
    }
  }
}

export let createStyledMacro = ({
  importPath,
  originalImportPath = importPath,
  isWeb
}: {
  importPath: string,
  originalImportPath?: string,
  isWeb: boolean
}) =>
  createMacro(({ references, state, babel, isEmotionCall }) => {
    if (!isEmotionCall) {
      state.emotionSourceMap = true
    }
    const t = babel.types
    if (references.default && references.default.length) {
      references.default.forEach(reference => {
        styledTransformer({
          state,
          babel,
          reference,
          importPath: originalImportPath,
          options: { baseImportPath: importPath, isWeb }
        })
      })
    }
    Object.keys(references)
      .filter(x => x !== 'default')
      .forEach(referenceKey => {
        let runtimeNode = addNamed(state.file.path, referenceKey, importPath)

        references[referenceKey].reverse().forEach(reference => {
          reference.replaceWith(t.cloneDeep(runtimeNode))
        })
      })
  })
