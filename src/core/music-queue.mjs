// Queue identity and O(1) linked-list operations, independent of rendering.
export class MusicQueue {
  constructor() {
    this.head = null;
    this.tail = null;
    this.size = 0;
    this.map = {};
    this._seed = 0;
  }
  _node(song) {
    return { song, id: `n${++this._seed}`, prev: null, next: null };
  }

  push(song) {
    const node = this._node(song);
    if (!this.tail) {
      this.head = this.tail = node;
    } else {
      node.prev = this.tail;
      this.tail.next = node;
      this.tail = node;
    }
    this.map[node.id] = node;
    this.size++;
    return node;
  }

  // Detach a node (keeps it in map, doesn't destroy)
  detach(node) {
    if (node.prev) node.prev.next = node.next;
    else this.head = node.next;
    if (node.next) node.next.prev = node.prev;
    else this.tail = node.prev;
    node.prev = null;
    node.next = null;
    this.size--;
  }

  // Full remove
  remove(node) {
    this.detach(node);
    delete this.map[node.id];
  }

  // Insert node right after anchor
  insertAfter(anchor, node) {
    const after = anchor.next;
    node.prev = anchor;
    node.next = after;
    anchor.next = node;
    if (after) after.prev = node;
    else this.tail = node;
    this.map[node.id] = node;
    this.size++;
  }

  // Insert node right before target
  insertBefore(target, node) {
    const before = target.prev;
    node.next = target;
    node.prev = before;
    target.prev = node;
    if (before) before.next = node;
    else this.head = node;
    this.map[node.id] = node;
    this.size++;
  }

  // Append to end
  appendNode(node) {
    node.prev = this.tail;
    node.next = null;
    if (this.tail) this.tail.next = node;
    else this.head = node;
    this.tail = node;
    this.map[node.id] = node;
    this.size++;
  }

  // Move node before target  (O(1) pointer surgery)
  moveBefore(node, target) {
    if (node === target) return;
    this.detach(node);
    this.insertBefore(target, node);
  }

  // Move node to end  (O(1))
  moveToEnd(node) {
    if (node === this.tail) return;
    this.detach(node);
    this.appendNode(node);
  }

  toArray() {
    const a = [];
    let c = this.head;
    while (c) {
      a.push(c);
      c = c.next;
    }
    return a;
  }

  clear() {
    this.head = this.tail = null;
    this.map = {};
    this.size = 0;
  }
}
