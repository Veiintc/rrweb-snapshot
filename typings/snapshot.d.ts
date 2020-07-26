import { serializedNodeWithId, INode, idNodeMap, MaskInputOptions, snapshotOptions, serializeOptions } from './types';
export declare function absoluteToStylesheet(cssText: string | null, href: string): string;
export declare function absoluteToDoc(doc: Document, attributeValue: string): string;
export declare function transformAttribute(doc: Document, name: string, value: string): string;
export declare function serializeNodeWithId(n: Node | INode, doc: Document, map: idNodeMap, blockClass: string | RegExp, skipChild?: boolean, inlineStylesheet?: boolean, maskInputOptions?: MaskInputOptions,options?: serializeOptions): serializedNodeWithId | null;
declare function snapshot(n: Document, blockClass: string | RegExp | undefined, inlineStylesheet: boolean | undefined, maskAllInputsOrOptions: boolean | MaskInputOptions ,options?: snapshotOptions): [serializedNodeWithId | null, idNodeMap];
export default snapshot;
