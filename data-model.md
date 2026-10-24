# High-Level Backend Data Model

## The Basic Model, Abstractly

By a **tree**, we mean a finite, labeled, rooted tree, considered up to isomorphism as a labeled rooted tree (and not considered to be ordered/planar). Both its edges and nodes are assumed to be labeled, except where we explicitly remove the label of its root. By an **edged tree**, we mean a tree that has a **root edge** connecting to its root node and no other node.

There is a type K whose terms k:K are called **kinds**, and associated with each kind is a type, O(k), of **k-objects**. There is a type, D, of **datatypes** and for each d:D a type, T(d), of **d-values**.

We may abuse nomenclature and use any of the concepts defined above to refer also to a node labeled by a term of that type.

A **linkage** is a node labeled by a text string or a Boolean value.

A **specification** is a tree, t, satisfying the following conditions:

- t's nodes are either kinds, datatypes, or linkages;
- A node of t is a kind if and only if it is a leaf of t. 
- Only the root of t may be a datatype.
- The edges of t are labeled by text strings.

A **field** is a specification whose root is a datatype and any other specification is a **location**. A **tag** is a specification whose root is a Boolean, and a **choice** is a specification whose root is a text string. If t is a specification, and s is the subtree rooted at a child of t, we say that t is **located at s**, and we call s **a location of t**. Conversely, we refer to t as an **entry** of s. A **relation** is a specification with more than one location. A **parameter** of a specification, s, is an edged subtree of s containing a location of s.

A **schema** is a set, S, of specifications, such that if a specification s is in S, then any location of s will also be in S, and no two distinct fields in S share the same parameterization, nor does any tag in S share a parameterization with any field in S, nor does any choice in S share a parameterization with any tag or field in S.

A **record**, r, in a schema S is a tree obtained by taking a specification, s, of S and replacing each leaf, k, with a k-object, and -- when s is a field -- its root, d, with a d-value.

As with specifications, if r is a record and q is the subtree rooted at a child of r's root, we say r is **located at** q, and call q a **location** of r and r an **entry** of q. An **argument** of r is a location of r together with the edge connecting it to r's root. Sanity check: the underlying specification of a location of r is a location of the underlying specification of r, so every location of r is itself a record in S; likewise, the underlying parameter of an argument of r is a parameter of the underlying specification of r.

If t and u are both specifications or both records, we call t a **dependency** of u, and u a **dependent** of t, if t is the subtree of u rooted at one of u's nodes; t is a **strict** dependency of u if that node isn't u's root. For example, every location of u is a strict dependency of u.

The **argumentation** of r is the tree obtained from r by removing the label of its root. Similarly, the **parameterization** of a specification is the tree obtained from it by removing the label of its root.

The **output** of a specification or record is the label of its root, so a specification is its parameterization together with its output, and a record is its argumentation together with its output. If p is a parameterization and S is a schema, the **outputs** of p in S are the outputs of the specifications in S whose parameterization is p.

A set of records, $\Sigma$, constitutes a **state** in the schema S if every location of every record in $\Sigma$ is in $\Sigma$, and any two distinct records in $\Sigma$ with the same argumentation are objects.




