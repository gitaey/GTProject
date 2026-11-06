package com.gtp.domain.geoserver.service;

import com.gtp.domain.geoserver.dto.LayerGroupCreateRequest;
import com.gtp.global.exception.CustomException;
import com.gtp.global.gis.GisErrorCode;
import org.w3c.dom.Document;
import org.xml.sax.ErrorHandler;
import org.xml.sax.InputSource;
import org.xml.sax.SAXException;
import org.xml.sax.SAXParseException;

import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.parsers.ParserConfigurationException;
import javax.xml.stream.XMLOutputFactory;
import javax.xml.stream.XMLStreamException;
import javax.xml.stream.XMLStreamWriter;
import javax.xml.transform.OutputKeys;
import javax.xml.transform.Transformer;
import javax.xml.transform.TransformerException;
import javax.xml.transform.TransformerFactory;
import javax.xml.transform.dom.DOMSource;
import javax.xml.transform.stream.StreamResult;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.StringWriter;
import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * GeoServer 레이어 그룹 XML 도우미(순수 static — GeoServer·Spring 없이 점검한다).
 * 보내는 XML은 문자열을 이어 붙이지 않고 XMLStreamWriter/Transformer로 만들어 이스케이프를 맡기고,
 * 받은 XML은 XXE(외부 엔터티)·DOCTYPE을 막은 파서로만 읽는다(남의 GeoServer가 악성 XML을 줄 수 있다는 전제).
 */
final class LayerGroupXml {

    private LayerGroupXml() {
    }

    /**
     * 만들기 본문. layers[0]이 가장 먼저 그리는 레이어이며 순서를 뒤집지 않는다. 스타일은 레이어 수만큼 빈 {@code <style/>}
     * (= 레이어 기본 스타일). {@code <workspace>}·{@code <bounds>}는 넣지 않는다(소속은 POST 경로, 영역은 GeoServer 자동 계산).
     * title·description·mode는 이미 검사·정리된 값이어야 한다(null이면 요소 생략).
     */
    static String buildCreate(LayerGroupCreateRequest req) {
        return buildCreate(req.getName(), req.getMode(), req.getTitle(), req.getDescription(), req.getLayers());
    }

    static String buildCreate(String name, String mode, String title, String description, List<String> layers) {
        try {
            StringWriter out = new StringWriter();
            XMLStreamWriter w = XMLOutputFactory.newDefaultFactory().createXMLStreamWriter(out);
            w.writeStartDocument("UTF-8", "1.0");
            w.writeStartElement("layerGroup");
            text(w, "name", name);
            text(w, "mode", mode);
            if (title != null) text(w, "title", title);
            if (description != null) text(w, "abstractTxt", description);
            w.writeStartElement("publishables");
            for (String layer : layers) {
                w.writeStartElement("published");
                w.writeAttribute("type", "layer");
                text(w, "name", layer);
                w.writeEndElement();
            }
            w.writeEndElement();
            w.writeStartElement("styles");
            for (int i = 0; i < layers.size(); i++) {
                w.writeEmptyElement("style");
            }
            w.writeEndElement();
            w.writeEndElement();
            w.writeEndDocument();
            w.flush();
            w.close();
            return out.toString();
        } catch (XMLStreamException e) {
            throw new CustomException(GisErrorCode.GEOSERVER_RESPONSE_INVALID);
        }
    }

    private static void text(XMLStreamWriter w, String tag, String value) throws XMLStreamException {
        w.writeStartElement(tag);
        // 줄바꿈 \r은 XML 파서가 \n으로 바꿔 버리므로 문자 참조(&#13;)로 써서 보존한다
        int from = 0;
        for (int i = value.indexOf('\r'); i >= 0; i = value.indexOf('\r', from)) {
            w.writeCharacters(value.substring(from, i));
            w.writeEntityRef("#13");
            from = i + 1;
        }
        w.writeCharacters(value.substring(from));
        w.writeEndElement();
    }

    /**
     * 받은 XML을 DOM으로 읽는다. DOCTYPE 자체를 거절하므로 외부 엔터티·엔터티 폭탄이 불가능하다.
     * 읽을 수 없으면 GEOSERVER_RESPONSE_INVALID(내용·원인은 문구에 넣지 않는다).
     */
    static Document parseSecure(byte[] xml) {
        try {
            DocumentBuilderFactory f = DocumentBuilderFactory.newInstance();
            f.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
            f.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            f.setFeature("http://xml.org/sax/features/external-general-entities", false);
            f.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
            f.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false);
            f.setXIncludeAware(false);
            f.setExpandEntityReferences(false);
            f.setNamespaceAware(true); // atom:link를 네임스페이스 URI로 찾아야 한다
            DocumentBuilder b = f.newDocumentBuilder();
            b.setErrorHandler(new ErrorHandler() { // 기본 처리기는 stderr에 찍는다
                @Override public void warning(SAXParseException e) { }
                @Override public void error(SAXParseException e) throws SAXException { throw e; }
                @Override public void fatalError(SAXParseException e) throws SAXException { throw e; }
            });
            InputSource src = new InputSource(new ByteArrayInputStream(xml));
            return b.parse(src);
        } catch (ParserConfigurationException | SAXException | IOException | RuntimeException e) {
            throw new CustomException(GisErrorCode.GEOSERVER_RESPONSE_INVALID);
        }
    }

    /** DOM을 UTF-8 XML(선언 포함)로 직렬화한다. 외부 DTD·스타일시트 접근은 막는다. */
    static String serialize(Document doc) {
        try {
            TransformerFactory tf = TransformerFactory.newInstance();
            tf.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
            tf.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
            tf.setAttribute(XMLConstants.ACCESS_EXTERNAL_STYLESHEET, "");
            Transformer t = tf.newTransformer();
            t.setOutputProperty(OutputKeys.ENCODING, "UTF-8");
            t.setOutputProperty(OutputKeys.INDENT, "no");
            java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
            t.transform(new DOMSource(doc), new StreamResult(out));
            return new String(out.toByteArray(), StandardCharsets.UTF_8);
        } catch (TransformerException e) {
            throw new CustomException(GisErrorCode.GEOSERVER_RESPONSE_INVALID);
        }
    }
}
