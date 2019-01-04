const plantumlEncoder = require('plantuml-encoder')

/**
 * Convert an (Opal) Hash to JSON.
 * @private
 */
const fromHash = function (hash) {
  const object = {}
  const data = hash.$$smap
  for (let key in data) {
    object[key] = data[key]
  }
  return object
}

function serverUnavailableBlock (processor, parent, context, source, attrs) {
  return processor.createBlock(parent, context, source, attrs)
}

function createImageSrc (doc, text, target, format, vfs) {
  const serverUrl = doc.getAttribute('plantuml-server-url')
  const shouldFetch = doc.isAttribute('plantuml-fetch-diagram')
  let diagramUrl = `${serverUrl}/${format}/${plantumlEncoder.encode(text)}`
  if (shouldFetch) {
    diagramUrl = require('./fetch').save(diagramUrl, doc, target, format, vfs)
  }
  return diagramUrl
}

function plantumlBlock (context) {
  return function () {
    this.onContext(['listing', 'literal'])
    this.positionalAttributes(['target', 'format'])

    this.process((parent, reader, attrs) => {
      if (typeof attrs === 'object' && '$$smap' in attrs) {
        attrs = fromHash(attrs)
      }
      const doc = parent.getDocument()
      const diagramType = this.name.toString()
      let diagramText = reader.getString()
      // If "subs" attribute is specified, substitute accordingly.
      // Be careful not to specify "specialcharacters" or your diagram code won't be valid anymore!
      const subs = attrs.subs
      if (subs) {
        diagramText = parent.$apply_subs(diagramText, parent.$resolve_subs(subs), true)
      }
      if (!/^@start([a-z]+)\n[\s\S]*\n@end\1$/.test(diagramText)) {
        if (diagramType === 'plantuml') {
          diagramText = '@startuml\n' + diagramText + '\n@enduml'
        } else if (diagramType === 'ditaa') {
          diagramText = '@startditaa\n' + diagramText + '\n@endditaa'
        } else if (diagramType === 'graphviz') {
          diagramText = '@startdot\n' + diagramText + '\n@enddot'
        }
      }
      const serverUrl = doc.getAttribute('plantuml-server-url')
      const role = attrs.role
      const blockId = attrs.id
      const title = attrs.title

      if (serverUrl) {
        const target = attrs.target
        const format = attrs.format || 'png'
        if (format === 'png' || format === 'svg') {
          const imageUrl = createImageSrc(doc, diagramText, target, format, context.vfs)
          const blockAttrs = {
            role: role ? `${role} plantuml` : 'plantuml',
            target: imageUrl,
            alt: target || 'diagram',
            title
          }
          if (blockId) blockAttrs.id = blockId
          return this.createImageBlock(parent, blockAttrs)
        } else {
          console.warn(`Skipping plantuml block. Format ${format} is unsupported by PlantUML`)
          attrs.role = role ? `${role} plantuml-error` : 'plantuml-error'
          return serverUnavailableBlock(this, parent, attrs['cloaked-context'], diagramText, attrs)
        }
      } else {
        console.warn('Skipping plantuml block. PlantUML Server URL not defined in :plantuml-server-url: attribute.')
        attrs.role = role ? `${role} plantuml-error` : 'plantuml-error'
        return serverUnavailableBlock(this, parent, attrs['cloaked-context'], diagramText, attrs)
      }
    })
  }
}

const antoraAdapter = (file, contentCatalog) => ({
  add: (image) => {
    const { component, version, module } = file.src
    contentCatalog.addFile({
      contents: image.contents,
      src: {
        component,
        version,
        module,
        family: 'image',
        mediaType: image.mediaType,
        basename: image.basename,
        relative: image.basename
      }
    })
  }
})

module.exports.register = function register (registry, context = {}) {
  // patch context in case of Antora
  if (typeof context.contentCatalog !== 'undefined' && typeof context.contentCatalog.addFile !== 'undefined' && typeof context.contentCatalog.addFile === 'function' && typeof context.file !== 'undefined') {
    context.vfs = antoraAdapter(context.file, context.contentCatalog)
  }

  if (typeof registry.register === 'function') {
    registry.register(function () {
      this.block('plantuml', plantumlBlock(context))
      this.block('ditaa', plantumlBlock(context))
      this.block('graphviz', plantumlBlock(context))
    })
  } else if (typeof registry.block === 'function') {
    registry.block('plantuml', plantumlBlock(context))
    registry.block('ditaa', plantumlBlock(context))
    registry.block('graphviz', plantumlBlock(context))
  }
  return registry
}
