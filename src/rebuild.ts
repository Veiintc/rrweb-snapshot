import { parse } from './css';
import {
  serializedNodeWithId,
  NodeType,
  tagMap,
  elementNode,
  idNodeMap,
  INode,
  callbackArray
} from './types';

const tagMap: tagMap = {
  script: 'noscript',
  // camel case svg element tag names
  altglyph: 'altGlyph',
  altglyphdef: 'altGlyphDef',
  altglyphitem: 'altGlyphItem',
  animatecolor: 'animateColor',
  animatemotion: 'animateMotion',
  animatetransform: 'animateTransform',
  clippath: 'clipPath',
  feblend: 'feBlend',
  fecolormatrix: 'feColorMatrix',
  fecomponenttransfer: 'feComponentTransfer',
  fecomposite: 'feComposite',
  feconvolvematrix: 'feConvolveMatrix',
  fediffuselighting: 'feDiffuseLighting',
  fedisplacementmap: 'feDisplacementMap',
  fedistantlight: 'feDistantLight',
  fedropshadow: 'feDropShadow',
  feflood: 'feFlood',
  fefunca: 'feFuncA',
  fefuncb: 'feFuncB',
  fefuncg: 'feFuncG',
  fefuncr: 'feFuncR',
  fegaussianblur: 'feGaussianBlur',
  feimage: 'feImage',
  femerge: 'feMerge',
  femergenode: 'feMergeNode',
  femorphology: 'feMorphology',
  feoffset: 'feOffset',
  fepointlight: 'fePointLight',
  fespecularlighting: 'feSpecularLighting',
  fespotlight: 'feSpotLight',
  fetile: 'feTile',
  feturbulence: 'feTurbulence',
  foreignobject: 'foreignObject',
  glyphref: 'glyphRef',
  lineargradient: 'linearGradient',
  radialgradient: 'radialGradient',
};
function getTagName(n: elementNode): string {
  let tagName = tagMap[n.tagName] ? tagMap[n.tagName] : n.tagName;
  if (tagName === 'link' && n.attributes._cssText) {
    tagName = 'style';
  }
  return tagName;
}

const HOVER_SELECTOR = /([^\\]):hover/g;
export function addHoverClass(cssText: string): string {
  const ast = parse(cssText, { silent: true });
  if (!ast.stylesheet) {
    return cssText;
  }
  ast.stylesheet.rules.forEach(rule => {
    if ('selectors' in rule) {
      (rule.selectors || []).forEach((selector: string) => {
        if (HOVER_SELECTOR.test(selector)) {
          const newSelector = selector.replace(HOVER_SELECTOR, '$1.\\:hover');
          cssText = cssText.replace(selector, `${selector}, ${newSelector}`);
        }
      });
    }
  });
  return cssText;
}

function buildNode(
  n: serializedNodeWithId,
  doc: Document,
  HACK_CSS: boolean,
): Node | null {
  switch (n.type) {
    case NodeType.Document:
      return doc.implementation.createDocument(null, '', null);
    case NodeType.DocumentType:
      return doc.implementation.createDocumentType(
        n.name,
        n.publicId,
        n.systemId,
      );
    case NodeType.Element:
      const tagName = getTagName(n);
      let node: Element;
      if (n.isSVG) {
        node = doc.createElementNS('http://www.w3.org/2000/svg', tagName);
      } else {
        node = doc.createElement(tagName);
      }
      for (const name in n.attributes) {
        if (!n.attributes.hasOwnProperty(name)) {
          continue;
        }
        let value = n.attributes[name];
        value = typeof value === 'boolean' ? '' : value;
        // attribute names start with rr_ are internal attributes added by rrweb
        if (!name.startsWith('rr_')) {
          const isTextarea = tagName === 'textarea' && name === 'value';
          const isRemoteOrDynamicCss =
            tagName === 'style' && name === '_cssText';
          if (isRemoteOrDynamicCss && HACK_CSS) {
            value = addHoverClass(value);
          }
          if (isTextarea || isRemoteOrDynamicCss) {
            const child = doc.createTextNode(value);
            // https://github.com/rrweb-io/rrweb/issues/112
            for (const c of Array.from(node.childNodes)) {
              if (c.nodeType === node.TEXT_NODE) {
                node.removeChild(c);
              }
            }
            node.appendChild(child);
            continue;
          }
          if (tagName === 'iframe' && name === 'src') {
            continue;
          }
          try {
            if (n.isSVG && name === 'xlink:href') {
              node.setAttributeNS('http://www.w3.org/1999/xlink', name, value);
            } else if (name == 'onload' || name == 'onclick' || name.substring(0, 7) == 'onmouse') {
              // Rename some of the more common atttributes from https://www.w3schools.com/tags/ref_eventattributes.asp
              // as setting them triggers a console.error (which shows up despite the try/catch)
              // Assumption: these attributes are not used to css
              node.setAttribute('_' + name, value);
            } else {
              node.setAttribute(name, value);
            }
          } catch (error) {
            // skip invalid attribute
          }
        } else {
          // handle internal attributes
          if (tagName === 'canvas' && name === 'rr_dataURL') {
            const image = document.createElement('img');
            image.src = value;
            image.onload = () => {
              const ctx = (node as HTMLCanvasElement).getContext('2d');
              if (ctx) {
                ctx.drawImage(image, 0, 0, image.width, image.height);
              }
            };
          }
          if (name === 'rr_width') {
            (node as HTMLElement).style.width = value;
          }
          if (name === 'rr_height') {
            (node as HTMLElement).style.height = value;
          }
          if (name === 'rr_mediaState') {
            switch (value) {
              case 'played':
                (node as HTMLMediaElement).play();
              case 'paused':
                (node as HTMLMediaElement).pause();
                break;
              default:
            }
          }
        }
      }
      return node;
    case NodeType.Text:
      return doc.createTextNode(
        n.isStyle && HACK_CSS ? addHoverClass(n.textContent) : n.textContent,
      );
    case NodeType.CDATA:
      return doc.createCDATASection(n.textContent);
    case NodeType.Comment:
      return doc.createComment(n.textContent);
    default:
      return null;
  }
}
function isIframe(n: serializedNodeWithId) {
  return n.type === NodeType.Element && n.tagName === 'iframe';
}

function buildIframe(
  iframe: HTMLIFrameElement,
  childNodes: serializedNodeWithId[],
  map: idNodeMap,
  cbs: callbackArray,
) {
  const targetDoc = iframe.contentDocument!;
  for (const childN of childNodes) {
    buildNodeWithSN(childN, targetDoc, map,cbs);
  }
}
export function buildNodeWithSN(
  n: serializedNodeWithId,
  doc: Document,
  map: idNodeMap,
  cbs: callbackArray,
  skipChild = false,
  HACK_CSS = true,
):[ INode | null ,serializedNodeWithId[]]{
  let node = buildNode(n, doc, HACK_CSS);
  if (!node) {
    return [null, []];
  }
  if (n.rootId) {
    console.assert(
      ((map[n.rootId] as unknown) as Document) === doc,
      'Target document should has the same root id.',
    );
  }
  // use target document as root document
  if (n.type === NodeType.Document) {
    // close before open to make sure document was closed
    doc.close();
    doc.open();
    node = doc;
  }

  (node as INode).__sn = n;
  map[n.id] = node as INode;
  if (
    (n.type === NodeType.Document || n.type === NodeType.Element) &&
    !skipChild
  ) {
    const nodeIsIframe = isIframe(n);
    if (nodeIsIframe) {
      return [node as INode, n.childNodes];
    }
    for (const childN of n.childNodes) {
      const [childNode, nestedNodes]  = buildNodeWithSN(childN, doc, map,cbs, false, HACK_CSS,);
      if (!childNode) {
        console.warn('Failed to rebuild', childN);
        continue;
      } 
      node.appendChild(childNode);
      if (nestedNodes.length === 0) {
        continue;
      }
      const childNodeIsIframe = isIframe(childN);
      if (childNodeIsIframe) {
        cbs.push(() =>
          buildIframe(
            (childNode as unknown) as HTMLIFrameElement,
            nestedNodes,
            map,
            cbs,
          ),
        );
      }
      
    }
  }
  return [node as INode,[]];
}

function rebuild(
  n: serializedNodeWithId,
  doc: Document,
  /**
   * This is not a public API yet, just for POC
   */
  HACK_CSS: boolean = true,
): [Node | null, idNodeMap] {
  const idNodeMap: idNodeMap = {};
  const callbackArray: callbackArray = [];
  const [node] = buildNodeWithSN(n, doc, idNodeMap, callbackArray);
  callbackArray.forEach((f:any) => f());
  return [node, idNodeMap];
  //return [buildNodeWithSN(n, doc, idNodeMap, false, HACK_CSS), idNodeMap];
}

export default rebuild;
