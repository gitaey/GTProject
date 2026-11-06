package com.gtp.domain.geoserver.service;

import com.gtp.domain.geoserver.dto.LayerGroupBounds;
import com.gtp.domain.geoserver.dto.LayerGroupDetail;
import com.gtp.domain.geoserver.dto.LayerGroupMember;
import com.gtp.domain.geoserver.dto.LayerGroupMemberRef;
import com.gtp.global.exception.CustomException;
import com.gtp.global.gis.GisErrorCode;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * GeoServer가 준 그룹 XML(DOM)을 수정 요청대로 고친다(순수 static — GeoServer 없이 점검한다).
 * 바꾸는 것은 제목·설명·방식·레이어 목록(publishables)·스타일(styles)·영역(bounds)뿐이고, 키워드·메타데이터 링크·속성·날짜 등
 * 나머지 요소는 손대지 않는다. 원래 있던 레이어의 published·style 요소는 그대로 복제해(스타일 이름 표기를 우리가 만들지 않는다)
 * 새 순서로 다시 짠다. 순서는 뒤집지 않는다(0 = 가장 먼저 그림).
 */
final class LayerGroupXmlEdit {

    static final String ATOM_NS = "http://www.w3.org/2005/Atom";

    private LayerGroupXmlEdit() {
    }

    /**
     * @param cur     수정 전 JSON으로 읽은 상세(원래 멤버 판정·소속 작업공간·표시 이름에 쓴다)
     * @param members 저장 후 최종 멤버(이미 검사된 값)
     * @param bounds  새 영역(없으면 원래 &lt;bounds&gt;를 그대로 둔다)
     * @throws CustomException GEOSERVER_LAYERGROUP_NOT_EDITABLE(옛 형식), GEOSERVER_LAYERGROUP_CHANGED(원래 멤버를 못 찾음),
     *                         GEOSERVER_RESPONSE_INVALID(layerGroup XML이 아님)
     */
    static void apply(Document doc, LayerGroupDetail cur, String mode, String title, String description,
                      List<LayerGroupMemberRef> members, LayerGroupBounds bounds) {
        Element root = doc.getDocumentElement();
        if (root == null || !"layerGroup".equals(ln(root))) throw new CustomException(GisErrorCode.GEOSERVER_RESPONSE_INVALID);
        Element pubs = child(root, "publishables");
        if (pubs == null) throw GisErrorCode.GEOSERVER_LAYERGROUP_NOT_EDITABLE.exception(LayerGroupJson.LEGACY_REASON);
        Element nameEl = child(root, "name");
        if (nameEl == null || !cur.getName().equals(text(nameEl))) throw new CustomException(GisErrorCode.GEOSERVER_RESPONSE_INVALID);
        String wms = cur.getWmsName();

        // 1) GeoServer가 출력에만 붙이는 atom:link 전부 삭제  2) 소속은 PUT 경로가 정하므로 <workspace> 삭제(<name>은 그대로)
        for (Element link : atomLinks(doc)) {
            link.getParentNode().removeChild(link);
        }
        Element wsEl = child(root, "workspace");
        if (wsEl != null) root.removeChild(wsEl);

        // 3) 제목·설명·방식
        Element modeEl = setText(doc, root, "mode", mode, null);
        setText(doc, root, "title", title, modeEl);
        setText(doc, root, "abstractTxt", description, null);

        // 4) 멤버·스타일 다시 짜기
        rebuildMembers(doc, root, pubs, cur, members, wms);

        // 5) 영역
        if (bounds != null) replaceBounds(doc, root, bounds);
    }

    // ── 멤버·스타일 ────────────────────────────────────────────

    private static void rebuildMembers(Document doc, Element root, Element pubs, LayerGroupDetail cur,
                                       List<LayerGroupMemberRef> members, String wms) {
        List<Element> pubEls = children(pubs, "published");
        Element stylesEl = child(root, "styles");
        List<Element> styleEls = stylesEl == null ? new ArrayList<>() : children(stylesEl, "style");
        // JSON(cur)과 XML이 같은 상태여야 짝이 맞는다. 그 사이 바뀌었으면 덮어쓰지 않는다.
        if (pubEls.size() != cur.getMembers().size()) throw GisErrorCode.GEOSERVER_LAYERGROUP_CHANGED.exception(wms);

        Map<String, Integer> origCount = new HashMap<>();
        for (LayerGroupMember m : cur.getMembers()) origCount.merge(key(m.getType(), m.getName()), 1, Integer::sum);
        Map<String, Integer> seen = new HashMap<>();
        boolean[] used = new boolean[pubEls.size()];

        List<Node> newPubs = new ArrayList<>();
        List<Node> newStyles = new ArrayList<>();
        for (LayerGroupMemberRef ref : members) {
            String key = key(ref.getType(), ref.getName());
            int n = seen.merge(key, 1, Integer::sum);
            boolean original = n <= origCount.getOrDefault(key, 0);
            if (original) {
                int idx = findPair(pubEls, used, ref.getType(), ref.getName(), cur.getWorkspace());
                if (idx < 0) throw GisErrorCode.GEOSERVER_LAYERGROUP_CHANGED.exception(wms);
                used[idx] = true;
                newPubs.add(pubEls.get(idx).cloneNode(true));
                newStyles.add(idx < styleEls.size() ? styleEls.get(idx).cloneNode(true) : create(doc, root, "style"));
            } else {
                if (!"layer".equals(ref.getType())) throw GisErrorCode.GEOSERVER_LAYERGROUP_CHANGED.exception(wms);
                Element p = create(doc, pubs, "published");
                p.setAttribute("type", "layer");
                Element nm = create(doc, p, "name");
                nm.setTextContent(ref.getName());
                p.appendChild(nm);
                newPubs.add(p);
                newStyles.add(create(doc, root, "style")); // 빈 칸 = 레이어 기본 스타일
            }
        }

        clear(pubs);
        for (Node p : newPubs) pubs.appendChild(p);
        if (stylesEl == null) {
            stylesEl = create(doc, root, "styles");
            root.insertBefore(stylesEl, pubs.getNextSibling());
        }
        clear(stylesEl);
        for (Node s : newStyles) stylesEl.appendChild(s);
    }

    private static String key(String type, String name) {
        return type + "|" + name;
    }

    /** (type, name)이 같은 아직 안 쓴 원래 짝의 위치. 이름은 정확히 같음 → 안 되면 작업공간까지 풀어 쓴 이름이 같은지(표기 차이 방어). */
    private static int findPair(List<Element> pubEls, boolean[] used, String type, String name, String groupWs) {
        for (int pass = 0; pass < 2; pass++) {
            for (int i = 0; i < pubEls.size(); i++) {
                if (used[i]) continue;
                Element p = pubEls.get(i);
                String t = p.getAttribute("type");
                if (t == null || t.isEmpty()) t = "layer";
                if (!t.equals(type)) continue;
                Element nm = child(p, "name");
                String xmlName = nm == null ? null : text(nm);
                if (xmlName == null) continue;
                boolean match = pass == 0 ? xmlName.equals(name) : sameQualified(xmlName, name, groupWs);
                if (match) return i;
            }
        }
        return -1;
    }

    private static boolean sameQualified(String a, String b, String groupWs) {
        String qa = qualify(a, groupWs);
        return qa != null && qa.equals(qualify(b, groupWs));
    }

    /** 접두사가 없으면 작업공간 그룹의 작업공간을 붙인다(전역 그룹이면 알 수 없어 null). */
    private static String qualify(String n, String groupWs) {
        if (n.indexOf(':') > 0) return n;
        return groupWs == null ? null : groupWs + ":" + n;
    }

    // ── 영역 ───────────────────────────────────────────────────

    private static void replaceBounds(Document doc, Element root, LayerGroupBounds b) {
        Element be = child(root, "bounds");
        Element oldCrs = null;
        if (be == null) {
            be = create(doc, root, "bounds");
            root.appendChild(be);
        } else {
            oldCrs = child(be, "crs");
        }
        Node crs;
        if (oldCrs != null && b.getCrs().equals(text(oldCrs))) {
            crs = oldCrs.cloneNode(true); // 속성(class="projected" 등) 보존
        } else {
            Element e = create(doc, be, "crs");
            e.setTextContent(b.getCrs());
            crs = e;
        }
        clear(be);
        addNumber(doc, be, "minx", b.getMinx());
        addNumber(doc, be, "maxx", b.getMaxx());
        addNumber(doc, be, "miny", b.getMiny());
        addNumber(doc, be, "maxy", b.getMaxy());
        be.appendChild(crs);
    }

    private static void addNumber(Document doc, Element parent, String tag, double v) {
        Element e = create(doc, parent, tag);
        e.setTextContent(BigDecimal.valueOf(v).toPlainString());
        parent.appendChild(e);
    }

    // ── DOM 도우미 ─────────────────────────────────────────────

    /** 값이 있으면 만들거나 바꾸고 null이면 요소를 지운다. 새로 만들 때 after가 있으면 그 뒤에, 없으면 맨 끝에 붙인다. */
    private static Element setText(Document doc, Element root, String tag, String value, Element after) {
        Element e = child(root, tag);
        if (value == null) {
            if (e != null) root.removeChild(e);
            return null;
        }
        if (e == null) {
            e = create(doc, root, tag);
            if (after != null && after.getParentNode() == root) root.insertBefore(e, after.getNextSibling());
            else root.appendChild(e);
        }
        e.setTextContent(value);
        return e;
    }

    private static Element create(Document doc, Node parentForNs, String tag) {
        return doc.createElementNS(parentForNs.getNamespaceURI(), tag);
    }

    private static void clear(Element e) {
        while (e.getFirstChild() != null) e.removeChild(e.getFirstChild());
    }

    private static String ln(Node n) {
        return n.getLocalName() != null ? n.getLocalName() : n.getNodeName();
    }

    private static String text(Element e) {
        String s = e.getTextContent();
        return s == null ? null : s.trim();
    }

    private static Element child(Element parent, String tag) {
        for (Node n = parent.getFirstChild(); n != null; n = n.getNextSibling()) {
            if (n instanceof Element && ln(n).equals(tag)) return (Element) n;
        }
        return null;
    }

    private static List<Element> children(Element parent, String tag) {
        List<Element> out = new ArrayList<>();
        for (Node n = parent.getFirstChild(); n != null; n = n.getNextSibling()) {
            if (n instanceof Element && ln(n).equals(tag)) out.add((Element) n);
        }
        return out;
    }

    private static List<Element> atomLinks(Document doc) {
        NodeList l = doc.getElementsByTagNameNS(ATOM_NS, "link");
        List<Element> out = new ArrayList<>();
        for (int i = 0; i < l.getLength(); i++) out.add((Element) l.item(i));
        return out;
    }
}
