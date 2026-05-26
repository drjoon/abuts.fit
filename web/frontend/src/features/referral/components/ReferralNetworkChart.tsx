import { useId, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ReferralNode = {
  _id: string;
  role?: "requestor" | "salesman" | "devops";
  name?: string;
  email?: string;
  business?: string;
  businessAnchorId?: string;
  active?: boolean;
  lastMonthOrders?: number;
  lastMonthPaidOrders?: number;
  lastMonthBonusOrders?: number;
  lastMonthPaidRevenue?: number;
  lastMonthBonusRevenue?: number;
  children?: ReferralNode[];
};

type ReferralRole = "requestor" | "salesman" | "devops";

const ROLE_COLOR: Record<ReferralRole, string> = {
  requestor: "#3b82f6",
  salesman: "#64748b",
  devops: "#8b5cf6",
};

const ROLE_LABEL: Record<ReferralRole, string> = {
  requestor: "의뢰자",
  salesman: "영업자",
  devops: "개발운영사",
};

type ReferralNetworkChartProps = {
  data: ReferralNode | null;
  maxDepth?: number; // 의뢰자는 1 (직접 소개만), 관리자는 제한 없음
  title?: string;
  visibleRoles?: ReferralRole[];
  legendRoles?: ReferralRole[];
  chartHeight?: number;
  mode?: "tree" | "radial-tree" | "radial-group";
  currentBusinessAnchorId?: string | null;
  showCard?: boolean; // Card 래핑 여부 (기본값: true)
  showZoomControls?: boolean;
  defaultZoom?: number;
  minZoom?: number;
  maxZoom?: number;
  zoomStep?: number;
};

export function ReferralNetworkChart({
  data,
  maxDepth = 999,
  title = "소개 네트워크",
  visibleRoles,
  legendRoles = ["requestor", "salesman", "devops"],
  chartHeight = 500,
  mode = "tree",
  currentBusinessAnchorId,
  showCard = true,
  showZoomControls = false,
  defaultZoom = 1,
  minZoom = 0.6,
  maxZoom = 2,
  zoomStep = 0.1,
}: ReferralNetworkChartProps) {
  const gradientId = useId().replace(/:/g, "");
  const shadowId = `${gradientId}-shadow`;
  const haloId = `${gradientId}-halo`;
  const viewWidth = 1000;
  const viewHeight = Math.max(chartHeight, 340);
  const centerX = viewWidth / 2;
  const centerY = viewHeight / 2;
  const allowedRoles = new Set<ReferralRole>(
    (visibleRoles && visibleRoles.length
      ? visibleRoles
      : ["requestor", "salesman", "devops"]) as ReferralRole[],
  );
  const [zoom, setZoom] = useState(defaultZoom);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const isPanningRef = useRef(false);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);

  const trimLabel = (value: string, max = 11) =>
    value.length > max ? `${value.slice(0, max)}…` : value;

  const transformNode = (node: ReferralNode, depth: number = 0): any => {
    if (depth > maxDepth) return null;

    const role = (node.role || "requestor") as ReferralRole;
    if (depth > 0 && !allowedRoles.has(role)) return null;

    const children =
      depth < maxDepth && node.children
        ? node.children
            .map((child) => transformNode(child, depth + 1))
            .filter(Boolean)
        : [];

    return {
      id: node._id,
      name: String(node.business || node.name || node.email || node._id).trim(),
      role,
      businessAnchorId: node.businessAnchorId
        ? String(node.businessAnchorId)
        : null,
      orders: Number(node.lastMonthOrders || 0),
      children: children.length ? children : [],
    };
  };

  const root = data ? transformNode(data) : null;
  const focalBusinessAnchorId = currentBusinessAnchorId
    ? String(currentBusinessAnchorId)
    : null;

  type LayoutNode = {
    id: string;
    name: string;
    role: ReferralRole;
    orders: number;
    x: number;
    y: number;
    r: number;
    depth: number;
    isRoot: boolean;
  };

  type LayoutLink = {
    key: string;
    fromId: string;
    toId: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    curved: boolean;
  };

  const polar = (radius: number, angle: number) => ({
    x: centerX + Math.cos(angle) * radius,
    y: centerY + Math.sin(angle) * radius,
  });

  const countLeaves = (node: any): number => {
    if (!node.children?.length) return 1;
    return node.children.reduce(
      (sum: number, child: any) => sum + countLeaves(child),
      0,
    );
  };

  const collectVisibleNodes = (node: any): any[] => {
    const out: any[] = [node];
    for (const child of node.children || []) {
      out.push(...collectVisibleNodes(child));
    }
    return out;
  };

  const centerRadialGroupOnBusiness = (treeRoot: any) => {
    if (!treeRoot || !focalBusinessAnchorId) return treeRoot;
    const visibleNodes = collectVisibleNodes(treeRoot);
    const focalNode =
      visibleNodes.find(
        (node) =>
          String(node?.businessAnchorId || "") === focalBusinessAnchorId,
      ) || null;

    if (!focalNode) return treeRoot;
    if (String(focalNode.id) === String(treeRoot.id)) return treeRoot;

    return {
      ...focalNode,
      children: visibleNodes
        .filter((node) => String(node.id) !== String(focalNode.id))
        .map((node) => ({
          ...node,
          children: [],
        })),
    };
  };

  const buildRadialGroupLayout = (layoutRoot: any) => {
    const nodes: LayoutNode[] = [];
    const links: LayoutLink[] = [];
    const children = Array.isArray(layoutRoot.children)
      ? layoutRoot.children
      : [];
    const radiusX = Math.min(340, Math.max(190, 180 + children.length * 24));
    const radiusY = Math.min(120, Math.max(56, 52 + children.length * 6));

    nodes.push({
      id: layoutRoot.id,
      name: layoutRoot.name,
      role: layoutRoot.role,
      orders: layoutRoot.orders,
      x: centerX,
      y: centerY,
      r: 38,
      depth: 0,
      isRoot: true,
    });

    children.forEach((child: any, index: number) => {
      const angle =
        children.length === 1
          ? 0
          : children.length === 2
            ? index === 0
              ? Math.PI
              : 0
            : Math.PI - (index * Math.PI) / Math.max(children.length - 1, 1);
      const point = {
        x: centerX + Math.cos(angle) * radiusX,
        y: centerY + Math.sin(angle) * radiusY,
      };
      nodes.push({
        id: child.id,
        name: child.name,
        role: child.role,
        orders: child.orders,
        x: point.x,
        y: point.y,
        r: 28,
        depth: 1,
        isRoot: false,
      });
      links.push({
        key: `${layoutRoot.id}-${child.id}`,
        fromId: String(layoutRoot.id),
        toId: String(child.id),
        x1: centerX,
        y1: centerY,
        x2: point.x,
        y2: point.y,
        curved: true,
      });
    });

    return { nodes, links };
  };

  const buildRadialTreeLayout = (layoutRoot: any) => {
    const nodes: LayoutNode[] = [];
    const links: LayoutLink[] = [];
    const maxLayoutDepth = Math.max(1, Math.min(maxDepth, 4));
    const radiusStep = Math.min(
      200,
      Math.max(160, (Math.min(viewWidth, viewHeight) - 80) / maxLayoutDepth),
    );

    const D60 = Math.PI / 3;
    const D90 = Math.PI / 2;

    const getMolecularAngles = (
      n: number,
      incomingDir: number | null,
    ): number[] => {
      if (incomingDir === null) {
        if (n === 1) return [0];
        if (n === 2) return [-D60, D60];
        if (n === 3) return [-D90, D90 - D60, D90 + D60];
        if (n === 4) return [-2 * D60, -D60 / 2, D60 / 2, 2 * D60];
        if (n === 5) return [-2 * D60, -D60, 0, D60, 2 * D60];
        return Array.from({ length: n }, (_, i) => -2 * D60 + D60 * i);
      }
      if (n === 1) return [incomingDir];
      if (n === 2) return [incomingDir - D60, incomingDir + D60];
      if (n === 3)
        return [incomingDir - 2 * D60, incomingDir, incomingDir + 2 * D60];
      return Array.from(
        { length: n },
        (_, i) => incomingDir + (i - (n - 1) / 2) * D60,
      );
    };

    const placeNode = (
      node: any,
      depth: number,
      angle: number,
      incomingDir: number | null,
      parent?: LayoutNode,
    ): LayoutNode => {
      const point =
        depth === 0
          ? { x: centerX, y: centerY }
          : parent
            ? {
                x: parent.x + Math.cos(angle) * radiusStep,
                y: parent.y + Math.sin(angle) * radiusStep,
              }
            : polar(radiusStep, angle);
      const current: LayoutNode = {
        id: node.id,
        name: node.name,
        role: node.role,
        orders: node.orders,
        x: point.x,
        y: point.y,
        r: depth === 0 ? 38 : depth === 1 ? 27 : 22,
        depth,
        isRoot: depth === 0,
      };
      nodes.push(current);

      if (parent) {
        links.push({
          key: `${parent.id}-${current.id}`,
          fromId: String(parent.id),
          toId: String(current.id),
          x1: parent.x,
          y1: parent.y,
          x2: current.x,
          y2: current.y,
          curved: true,
        });
      }

      if (node.children?.length && depth < maxLayoutDepth) {
        const childAngles = getMolecularAngles(
          node.children.length,
          depth === 0 ? null : angle,
        );
        node.children.forEach((child: any, i: number) => {
          placeNode(child, depth + 1, childAngles[i], angle, current);
        });
      }

      return current;
    };

    placeNode(layoutRoot, 0, 0, null);

    return { nodes, links };
  };

  const buildTreeLayout = (layoutRoot: any) => {
    const nodes: LayoutNode[] = [];
    const links: LayoutLink[] = [];
    const levelSpacing = 220;
    const leafCount = Math.max(1, countLeaves(layoutRoot));
    const rowGap = leafCount === 1 ? 0 : (viewHeight - 120) / (leafCount - 1);
    let nextLeafIndex = 0;

    const placeNode = (
      node: any,
      depth: number,
      parent?: LayoutNode,
    ): LayoutNode => {
      const children = Array.isArray(node.children) ? node.children : [];
      const childLayouts = children.map((child: any) =>
        placeNode(child, depth + 1),
      );
      const y =
        childLayouts.length > 0
          ? childLayouts.reduce((sum, child) => sum + child.y, 0) /
            childLayouts.length
          : 60 + rowGap * nextLeafIndex++;
      const current: LayoutNode = {
        id: node.id,
        name: node.name,
        role: node.role,
        orders: node.orders,
        x: 110 + depth * levelSpacing,
        y,
        r: depth === 0 ? 30 : 22,
        depth,
        isRoot: depth === 0,
      };
      nodes.push(current);

      if (parent) {
        links.push({
          key: `${parent.id}-${current.id}`,
          fromId: String(parent.id),
          toId: String(current.id),
          x1: parent.x,
          y1: parent.y,
          x2: current.x,
          y2: current.y,
          curved: false,
        });
      }

      childLayouts.forEach((child) => {
        const existing = links.find(
          (link) => link.key === `${current.id}-${child.id}`,
        );
        if (!existing) {
          links.push({
            key: `${current.id}-${child.id}`,
            fromId: String(current.id),
            toId: String(child.id),
            x1: current.x,
            y1: current.y,
            x2: child.x,
            y2: child.y,
            curved: false,
          });
        }
      });

      return current;
    };

    const placeChildren = (node: any, current: LayoutNode) => {
      node.children?.forEach((child: any) => {
        const childNode = nodes.find((item) => item.id === child.id);
        if (childNode) {
          const hasLink = links.some(
            (link) => link.key === `${current.id}-${childNode.id}`,
          );
          if (!hasLink) {
            links.push({
              key: `${current.id}-${childNode.id}`,
              fromId: String(current.id),
              toId: String(childNode.id),
              x1: current.x,
              y1: current.y,
              x2: childNode.x,
              y2: childNode.y,
              curved: false,
            });
          }
          placeChildren(child, childNode);
        }
      });
    };

    const rootNode = placeNode(layoutRoot, 0, undefined);
    placeChildren(layoutRoot, rootNode);

    return {
      nodes,
      links: links.filter(
        (link, index, array) =>
          array.findIndex((item) => item.key === link.key) === index,
      ),
    };
  };

  const layoutRoot =
    root && mode === "radial-group" ? centerRadialGroupOnBusiness(root) : root;

  const layout = layoutRoot
    ? mode === "radial-group"
      ? buildRadialGroupLayout(layoutRoot)
      : mode === "radial-tree"
        ? buildRadialTreeLayout(layoutRoot)
        : buildTreeLayout(layoutRoot)
    : null;

  const fitLayout = (source: { nodes: LayoutNode[]; links: LayoutLink[] }) => {
    if (!source.nodes.length) return source;

    const padding = {
      left: 60,
      right: 60,
      top: 46,
      bottom: 50,
    };

    const estimateHalfLabelPx = (node: LayoutNode) => {
      const maxChars = node.isRoot ? 13 : 11;
      const pxPerChar = node.isRoot ? 9.5 : 8.5;
      const chars = Math.min(maxChars, node.name?.length ?? 0);
      return (chars * pxPerChar) / 2 + 8;
    };

    const bounds = source.nodes.reduce(
      (acc, node) => {
        const topLabelExtra = node.isRoot && node.orders > 0 ? 30 : 8;
        const bottomLabelExtra = 40;
        const halfLW = estimateHalfLabelPx(node);
        return {
          minX: Math.min(acc.minX, node.x - Math.max(node.r + 10, halfLW)),
          maxX: Math.max(acc.maxX, node.x + Math.max(node.r + 10, halfLW)),
          minY: Math.min(acc.minY, node.y - node.r - topLabelExtra),
          maxY: Math.max(acc.maxY, node.y + node.r + bottomLabelExtra),
        };
      },
      {
        minX: Number.POSITIVE_INFINITY,
        maxX: Number.NEGATIVE_INFINITY,
        minY: Number.POSITIVE_INFINITY,
        maxY: Number.NEGATIVE_INFINITY,
      },
    );

    const contentWidth = Math.max(1, bounds.maxX - bounds.minX);
    const contentHeight = Math.max(1, bounds.maxY - bounds.minY);
    const availableWidth = Math.max(
      1,
      viewWidth - padding.left - padding.right,
    );
    const availableHeight = Math.max(
      1,
      viewHeight - padding.top - padding.bottom,
    );
    const scale = Math.min(
      availableWidth / contentWidth,
      availableHeight / contentHeight,
      1,
    );

    const sourceCenterX = (bounds.minX + bounds.maxX) / 2;
    const sourceCenterY = (bounds.minY + bounds.maxY) / 2;
    const targetCenterX = viewWidth / 2;
    const targetCenterY = viewHeight / 2;

    const transformPoint = (x: number, y: number) => ({
      x: targetCenterX + (x - sourceCenterX) * scale,
      y: targetCenterY + (y - sourceCenterY) * scale,
    });

    return {
      nodes: source.nodes.map((node) => {
        const point = transformPoint(node.x, node.y);
        return {
          ...node,
          x: point.x,
          y: point.y,
          r: Math.max(node.isRoot ? 24 : 16, node.r * scale),
        };
      }),
      links: source.links.map((link) => {
        const from = transformPoint(link.x1, link.y1);
        const to = transformPoint(link.x2, link.y2);
        return {
          ...link,
          x1: from.x,
          y1: from.y,
          x2: to.x,
          y2: to.y,
        };
      }),
    };
  };

  const spreadOverlappingNodes = (source: {
    nodes: LayoutNode[];
    links: LayoutLink[];
  }) => {
    if (!source.nodes.length) return source;

    const nodes = source.nodes.map((node) => ({ ...node }));
    const iterations = 4;

    for (let iter = 0; iter < iterations; iter += 1) {
      for (let i = 0; i < nodes.length; i += 1) {
        for (let j = i + 1; j < nodes.length; j += 1) {
          const a = nodes[i];
          const b = nodes[j];
          if (a.isRoot && b.isRoot) continue;

          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.hypot(dx, dy);
          const minDist = a.r + b.r + 18;
          if (dist >= minDist) continue;

          const safeDx = dist > 0.001 ? dx : Math.cos((i + j + 1) * 0.73);
          const safeDy = dist > 0.001 ? dy : Math.sin((i + j + 1) * 0.73);
          const safeDist = Math.hypot(safeDx, safeDy);
          const ux = safeDx / safeDist;
          const uy = safeDy / safeDist;
          const push = (minDist - dist) / 2;

          if (!a.isRoot) {
            a.x -= ux * push;
            a.y -= uy * push;
          }
          if (!b.isRoot) {
            b.x += ux * push;
            b.y += uy * push;
          }
        }
      }
    }

    const byId = new Map(nodes.map((node) => [String(node.id), node]));
    const links = source.links.map((link) => {
      const from = byId.get(String(link.fromId));
      const to = byId.get(String(link.toId));
      if (!from || !to) return link;
      return {
        ...link,
        x1: from.x,
        y1: from.y,
        x2: to.x,
        y2: to.y,
      };
    });

    return { nodes, links };
  };

  const fittedLayout = layout
    ? fitLayout(spreadOverlappingNodes(layout))
    : null;

  const buildLinkPath = (link: LayoutLink) => {
    if (!link.curved) {
      const midX = (link.x1 + link.x2) / 2;
      return `M ${link.x1} ${link.y1} L ${midX} ${link.y1} L ${midX} ${link.y2} L ${link.x2} ${link.y2}`;
    }

    const controlX = (link.x1 + link.x2 + centerX) / 3;
    const controlY = (link.y1 + link.y2 + centerY) / 3;
    return `M ${link.x1} ${link.y1} Q ${controlX} ${controlY} ${link.x2} ${link.y2}`;
  };

  const fillColor = (role: ReferralRole, isRoot: boolean) =>
    isRoot ? "#2563eb" : ROLE_COLOR[role];

  const clampZoom = (next: number) =>
    Math.min(maxZoom, Math.max(minZoom, Number(next || 1)));

  const getPanBounds = (zoomValue: number) => {
    const extraX = Math.max(0, (viewWidth * (zoomValue - 1)) / 2);
    const extraY = Math.max(0, (viewHeight * (zoomValue - 1)) / 2);
    const marginX = 140;
    const marginY = 120;
    return {
      minX: -(extraX + marginX),
      maxX: extraX + marginX,
      minY: -(extraY + marginY),
      maxY: extraY + marginY,
    };
  };

  const clampPan = (
    nextPan: { x: number; y: number },
    zoomValue: number = zoom,
  ) => {
    const bounds = getPanBounds(zoomValue);
    return {
      x: Math.min(bounds.maxX, Math.max(bounds.minX, nextPan.x)),
      y: Math.min(bounds.maxY, Math.max(bounds.minY, nextPan.y)),
    };
  };

  const toViewPoint = (
    event:
      | React.PointerEvent<HTMLDivElement>
      | React.WheelEvent<HTMLDivElement>,
    target: HTMLDivElement,
  ) => {
    const rect = target.getBoundingClientRect();
    const x =
      rect.width > 0
        ? ((event.clientX - rect.left) / rect.width) * viewWidth
        : centerX;
    const y =
      rect.height > 0
        ? ((event.clientY - rect.top) / rect.height) * viewHeight
        : centerY;
    return { x, y };
  };

  const applyZoom = (
    nextZoomRaw: number,
    focalPoint?: { x: number; y: number },
  ) => {
    const nextZoom = clampZoom(nextZoomRaw);
    const anchor = focalPoint || { x: centerX, y: centerY };
    const currentZoom = zoom || 1;
    const zoomRatio = nextZoom / currentZoom;

    setZoom(nextZoom);
    setPan((prev) =>
      clampPan(
        {
          x: anchor.x - centerX - zoomRatio * (anchor.x - prev.x - centerX),
          y: anchor.y - centerY - zoomRatio * (anchor.y - prev.y - centerY),
        },
        nextZoom,
      ),
    );
  };

  const zoomLabel = `${Math.round(zoom * 100)}%`;

  if (!layoutRoot || !fittedLayout) {
    const emptyContent = (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        소개 데이터가 없습니다.
      </div>
    );

    if (!showCard) {
      return emptyContent;
    }

    return (
      <Card className="shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-sm font-semibold text-slate-700">
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>{emptyContent}</CardContent>
      </Card>
    );
  }

  const svgElement = (
    <svg
      viewBox={`0 0 ${viewWidth} ${viewHeight}`}
      className="w-full"
      style={{ height: `${viewHeight}px` }}
      role="img"
      aria-label={title}
    >
      <defs>
        <radialGradient id={haloId} cx="50%" cy="50%" r="65%">
          <stop offset="0%" stopColor="#dbeafe" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <filter id={shadowId} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow
            dx="0"
            dy="6"
            stdDeviation="8"
            floodColor="#1d4ed8"
            floodOpacity="0.14"
          />
        </filter>
      </defs>

      <rect x="0" y="0" width={viewWidth} height={viewHeight} fill="#ffffff" />
      <circle
        cx={centerX}
        cy={centerY}
        r={Math.min(viewWidth, viewHeight) * 0.32}
        fill={`url(#${haloId})`}
      />

      <g
        transform={`translate(${pan.x} ${pan.y}) translate(${centerX} ${centerY}) scale(${zoom}) translate(${-centerX} ${-centerY})`}
      >
        {fittedLayout.links.map((link) => (
          <path
            key={link.key}
            d={buildLinkPath(link)}
            fill="none"
            stroke="#bfdbfe"
            strokeWidth={2.5}
            strokeLinecap="round"
          />
        ))}

        {fittedLayout.nodes.map((node) => (
          <g
            key={node.id}
            transform={`translate(${node.x}, ${node.y})`}
            filter={`url(#${shadowId})`}
          >
            {node.isRoot ? (
              <circle
                cx="0"
                cy="0"
                r={node.r + 16}
                fill="rgba(37,99,235,0.08)"
              />
            ) : null}
            <circle
              cx="0"
              cy="0"
              r={node.r}
              fill={fillColor(node.role, node.isRoot)}
              stroke={node.isRoot ? "#dbeafe" : "#eff6ff"}
              strokeWidth={node.isRoot ? 6 : 4}
            />
            <text
              x="0"
              y={node.r + 22}
              textAnchor="middle"
              fontSize={node.isRoot ? 16 : 13}
              fontWeight={node.isRoot ? 800 : 700}
              fill="#0f172a"
            >
              {trimLabel(node.name, node.isRoot ? 13 : 11)}
            </text>
            <text
              x="0"
              y={node.r + 40}
              textAnchor="middle"
              fontSize={12}
              fontWeight={600}
              fill="#475569"
            >
              {ROLE_LABEL[node.role]}
            </text>
            {node.isRoot && node.orders > 0 ? (
              <text
                x="0"
                y={-(node.r + 18)}
                textAnchor="middle"
                fontSize={12}
                fontWeight={700}
                fill="#2563eb"
              >
                최근 30일 {node.orders}건
              </text>
            ) : null}
          </g>
        ))}
      </g>
    </svg>
  );

  const zoomControlsElement = showZoomControls ? (
    <div
      data-zoom-controls="true"
      className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-md border border-slate-200 bg-white/95 px-1.5 py-1 shadow-sm"
    >
      <button
        type="button"
        className="h-7 w-7 rounded border border-slate-200 text-slate-700 hover:bg-slate-50"
        onClick={() => applyZoom(zoom - zoomStep)}
        aria-label="축소"
      >
        −
      </button>
      <span className="min-w-[52px] text-center text-xs font-medium text-slate-700">
        {zoomLabel}
      </span>
      <button
        type="button"
        className="h-7 w-7 rounded border border-slate-200 text-slate-700 hover:bg-slate-50"
        onClick={() => applyZoom(zoom + zoomStep)}
        aria-label="확대"
      >
        +
      </button>
      <button
        type="button"
        className="h-7 rounded border border-slate-200 px-2 text-xs text-slate-700 hover:bg-slate-50"
        onClick={() => {
          setZoom(clampZoom(defaultZoom));
          setPan(clampPan({ x: 0, y: 0 }, clampZoom(defaultZoom)));
        }}
      >
        초기화
      </button>
    </div>
  ) : null;

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!showZoomControls) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("[data-zoom-controls='true']")) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    isPanningRef.current = true;
    lastPointerRef.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!showZoomControls || !isPanningRef.current) return;
    const previous = lastPointerRef.current;
    if (!previous) {
      lastPointerRef.current = { x: event.clientX, y: event.clientY };
      return;
    }

    const containerRect = event.currentTarget.getBoundingClientRect();
    const widthScale =
      containerRect.width > 0 ? viewWidth / containerRect.width : 1;
    const heightScale =
      containerRect.height > 0 ? viewHeight / containerRect.height : 1;

    const dx = (event.clientX - previous.x) * widthScale;
    const dy = (event.clientY - previous.y) * heightScale;

    setPan((prev) => clampPan({ x: prev.x + dx, y: prev.y + dy }));
    lastPointerRef.current = { x: event.clientX, y: event.clientY };
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!showZoomControls) return;
    isPanningRef.current = false;
    lastPointerRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const legendElement =
    legendRoles.length > 0 ? (
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-600">
        {legendRoles.map((role) => (
          <div
            key={role}
            className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 shadow-sm"
          >
            <span
              className="inline-block h-3 w-3 rounded-full"
              style={{ backgroundColor: ROLE_COLOR[role] }}
            />
            <span className="font-medium">{ROLE_LABEL[role]}</span>
          </div>
        ))}
      </div>
    ) : null;

  if (!showCard) {
    return (
      <div className="w-full h-full flex flex-col">
        <div
          className={`relative ${showZoomControls ? "cursor-grab active:cursor-grabbing" : ""}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onWheel={(event) => {
            if (!showZoomControls) return;
            event.preventDefault();
            const delta = event.deltaY > 0 ? -zoomStep : zoomStep;
            applyZoom(zoom + delta, toViewPoint(event, event.currentTarget));
          }}
        >
          {zoomControlsElement}
          {svgElement}
        </div>
        {legendElement}
      </div>
    );
  }

  const chartContent = (
    <>
      <div
        className={`relative overflow-hidden rounded-2xl border border-slate-100 bg-white/80 shadow-inner ${showZoomControls ? "cursor-grab active:cursor-grabbing" : ""}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={(event) => {
          if (!showZoomControls) return;
          event.preventDefault();
          const delta = event.deltaY > 0 ? -zoomStep : zoomStep;
          applyZoom(zoom + delta, toViewPoint(event, event.currentTarget));
        }}
      >
        {zoomControlsElement}
        {svgElement}
      </div>
      {legendElement}
    </>
  );

  return (
    <Card className="border-slate-200/80 bg-gradient-to-br from-white via-white to-slate-50/60 shadow-sm">
      <CardHeader className="pb-4">
        <CardTitle className="text-sm font-semibold text-slate-700">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-2">{chartContent}</CardContent>
    </Card>
  );
}
