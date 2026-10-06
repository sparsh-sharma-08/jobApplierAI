"""
Resume export to DOCX and PDF formats.
"""
import json
import os
from typing import Dict, Any, Optional
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

OUTPUT_DIR = os.getenv("OUTPUT_DIR", "./data/resumes")
os.makedirs(OUTPUT_DIR, exist_ok=True)


def _clean_list(lst):
    if not isinstance(lst, list): return []
    cleaned = []
    for item in lst:
        if isinstance(item, dict):
            vals = list(item.values())
            cleaned.append(str(vals[0]) if vals else "")
        elif item is not None:
            cleaned.append(str(item))
    return cleaned


def clean_resume_data(data: Dict) -> Dict:
    def _clean_str(val):
        return str(val).strip() if val is not None else ""

    data["name"] = _clean_str(data.get("name"))
    data["summary"] = _clean_str(data.get("summary"))
    
    if "contact" in data and isinstance(data["contact"], dict):
        for k, v in data["contact"].items():
            data["contact"][k] = _clean_str(v)
            
    data["skills"] = _clean_list(data.get("skills", []))
    data["certifications"] = _clean_list(data.get("certifications", []))
    data["languages"] = _clean_list(data.get("languages", []))
    
    for exp in data.get("experience", []):
        if isinstance(exp, dict):
            for k in ["title", "company", "start_date", "end_date"]:
                exp[k] = _clean_str(exp.get(k))
            exp["highlights"] = _clean_list(exp.get("highlights", []))
            exp["technologies"] = _clean_list(exp.get("technologies", []))
            
    for proj in data.get("projects", []):
        if isinstance(proj, dict):
            for k in ["name", "description", "link"]:
                proj[k] = _clean_str(proj.get(k))
            proj["highlights"] = _clean_list(proj.get("highlights", []))
            proj["technologies"] = _clean_list(proj.get("technologies", []))
            
    for edu in data.get("education", []):
        if isinstance(edu, dict):
            for k in ["degree", "institution", "year", "gpa"]:
                edu[k] = _clean_str(edu.get(k))

    return data


def save_resume_json(resume_data: Dict, job_id: int) -> str:
    path = os.path.join(OUTPUT_DIR, f"resume_job_{job_id}_{_ts()}.json")
    with open(path, "w") as f:
        json.dump(resume_data, f, indent=2)
    return path


def save_resume_docx(resume_data: Dict, job_id: int) -> Optional[str]:
    try:
        from docx import Document
        from docx.shared import Pt, RGBColor, Inches
        from docx.enum.text import WD_ALIGN_PARAGRAPH

        doc = Document()

        # Narrow margins for ATS
        for section in doc.sections:
            section.top_margin = Inches(0.7)
            section.bottom_margin = Inches(0.7)
            section.left_margin = Inches(0.8)
            section.right_margin = Inches(0.8)

        # Name
        name_para = doc.add_paragraph()
        name_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = name_para.add_run(resume_data.get("name", ""))
        run.bold = True
        run.font.size = Pt(18)

        # Contact
        contact = resume_data.get("contact", {})
        contact_items = [v for v in [contact.get("email"), contact.get("phone"),
                                      contact.get("location"), contact.get("linkedin"),
                                      contact.get("github")] if v]
        if contact_items:
            contact_para = doc.add_paragraph(" | ".join(contact_items))
            contact_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
            if contact_para.runs:
                contact_para.runs[0].font.size = Pt(9)

        def add_section_heading(title):
            p = doc.add_paragraph()
            run = p.add_run(title.upper())
            run.bold = True
            run.font.size = Pt(10)
            # Add horizontal rule via bottom border
            from docx.oxml.ns import qn
            from docx.oxml import OxmlElement
            pPr = p._p.get_or_add_pPr()
            pBdr = OxmlElement('w:pBdr')
            bottom = OxmlElement('w:bottom')
            bottom.set(qn('w:val'), 'single')
            bottom.set(qn('w:sz'), '6')
            bottom.set(qn('w:space'), '1')
            bottom.set(qn('w:color'), '000000')
            pBdr.append(bottom)
            pPr.append(pBdr)

        # Summary
        summary = resume_data.get("summary")
        if summary:
            add_section_heading("Professional Summary")
            doc.add_paragraph(summary).runs[0].font.size = Pt(10)

        # Skills
        skills = resume_data.get("skills", [])
        if skills:
            add_section_heading("Technical Skills")
            doc.add_paragraph(", ".join(skills)).runs[0].font.size = Pt(10)

        # Experience
        experience = resume_data.get("experience", [])
        if experience:
            add_section_heading("Experience")
            for exp in experience:
                p = doc.add_paragraph()
                r = p.add_run(f"{exp.get('title', '')} — {exp.get('company', '')}")
                r.bold = True
                r.font.size = Pt(10)
                dates = f"{exp.get('start_date', '')} – {exp.get('end_date', 'Present')}"
                p2 = doc.add_paragraph(dates)
                p2.runs[0].italic = True
                p2.runs[0].font.size = Pt(9)
                for highlight in exp.get("highlights", []):
                    doc.add_paragraph(f"• {highlight}", style="List Bullet").runs[0].font.size = Pt(10)

        # Projects
        projects = resume_data.get("projects", [])
        if projects:
            add_section_heading("Projects")
            for proj in projects:
                p = doc.add_paragraph()
                r = p.add_run(proj.get("name", ""))
                r.bold = True
                r.font.size = Pt(10)
                tech = proj.get("technologies", [])
                if tech:
                    p.add_run(f"  ({', '.join(tech)})").font.size = Pt(9)
                desc = proj.get("description", "")
                if desc:
                    desc_para = doc.add_paragraph(desc)
                    if desc_para.runs:
                        desc_para.runs[0].font.size = Pt(10)
                for h in proj.get("highlights", []):
                    h_para = doc.add_paragraph(f"• {h}", style="List Bullet")
                    if h_para.runs:
                        h_para.runs[0].font.size = Pt(10)

        # Education
        education = resume_data.get("education", [])
        if education:
            add_section_heading("Education")
            for edu in education:
                p = doc.add_paragraph()
                r = p.add_run(f"{edu.get('degree', '')} — {edu.get('institution', '')}")
                r.bold = True
                r.font.size = Pt(10)
                details = edu.get("year", "")
                if edu.get("gpa"):
                    details += f"  |  GPA: {edu['gpa']}"
                if details:
                    doc.add_paragraph(details).runs[0].font.size = Pt(9)

        # Certifications
        certs = resume_data.get("certifications", [])
        if certs:
            add_section_heading("Certifications")
            for cert in certs:
                doc.add_paragraph(f"• {cert}").runs[0].font.size = Pt(10)

        path = os.path.join(OUTPUT_DIR, f"resume_job_{job_id}_{_ts()}.docx")
        doc.save(path)
        return path

    except ImportError:
        logger.warning("python-docx not installed. Skipping DOCX export.")
        return None
    except Exception as e:
        logger.error(f"DOCX generation failed: {e}")
        return None


def generate_resume_pdf_bytes(resume_data: Dict) -> Optional[bytes]:
    """Generate a clean, ATS-compatible PDF in memory matching the reference resume format."""
    import io
    import re
    pdf_buffer = io.BytesIO()

    try:
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Table, TableStyle, HRFlowable, Spacer
        from reportlab.lib.styles import ParagraphStyle
        from reportlab.lib.pagesizes import letter
        from reportlab.lib.units import inch
        from reportlab.lib import colors
        from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_JUSTIFY

        # Letter: 612 x 792 pt. Margins 0.45" left/right, 0.4" top/bottom.
        # Printable width: 612 - 64.8 = 547.2 pt.
        doc_pdf = SimpleDocTemplate(
            pdf_buffer,
            pagesize=letter,
            topMargin=0.4 * inch,
            bottomMargin=0.4 * inch,
            leftMargin=0.45 * inch,
            rightMargin=0.45 * inch
        )

        PRIMARY_COLOR = colors.HexColor('#1D4ED8')  # Distinctive professional royal blue
        DARK_TEXT = colors.HexColor('#0F172A')       # Slate 900
        SUBTLE_TEXT = colors.HexColor('#475569')     # Slate 600

        name_style = ParagraphStyle(
            'Name', fontName='Helvetica-Bold', fontSize=18, alignment=TA_CENTER,
            textColor=DARK_TEXT, spaceAfter=2, leading=22
        )
        contact_style = ParagraphStyle(
            'Contact', fontName='Helvetica', fontSize=8.5, alignment=TA_CENTER,
            textColor=SUBTLE_TEXT, spaceAfter=5, leading=11
        )
        section_heading_style = ParagraphStyle(
            'SectionHeading', fontName='Helvetica-Bold', fontSize=10, 
            textColor=PRIMARY_COLOR, spaceBefore=4, spaceAfter=1, leading=13
        )
        body_style = ParagraphStyle(
            'Body', fontName='Helvetica', fontSize=9, alignment=TA_JUSTIFY,
            textColor=DARK_TEXT, spaceAfter=3, leading=12
        )
        skill_line_style = ParagraphStyle(
            'SkillLine', fontName='Helvetica', fontSize=9,
            textColor=DARK_TEXT, spaceAfter=1.5, leading=12
        )
        project_title_style = ParagraphStyle(
            'ProjectTitle', fontName='Helvetica-Bold', fontSize=9.5,
            textColor=DARK_TEXT, spaceAfter=1, leading=12
        )
        project_sub_style = ParagraphStyle(
            'ProjectSub', fontName='Helvetica-Oblique', fontSize=8.5,
            textColor=SUBTLE_TEXT, leading=11
        )
        project_date_style = ParagraphStyle(
            'ProjectDate', fontName='Helvetica', fontSize=8.5, alignment=TA_RIGHT,
            textColor=SUBTLE_TEXT, leading=11
        )
        bullet_style = ParagraphStyle(
            'Bullet', fontName='Helvetica', fontSize=9, leftIndent=14,
            firstLineIndent=-10, spaceAfter=1.5, leading=12, alignment=TA_JUSTIFY,
            textColor=DARK_TEXT
        )

        story = []

        def add_heading(title: str):
            story.append(Paragraph(f"<b>{title.upper()}</b>", section_heading_style))
            story.append(HRFlowable(width="100%", thickness=0.8, color=PRIMARY_COLOR, spaceBefore=1, spaceAfter=3))

        # ── 1. Name ──────────────────────────────────────────────
        name = resume_data.get("name") or "SPARSH SHARMA"
        story.append(Paragraph(name.upper(), name_style))

        # ── 2. Contact ───────────────────────────────────────────
        contact = resume_data.get("contact", {})
        parts = []
        if contact.get("phone"):
            parts.append(str(contact["phone"]))
        if contact.get("email"):
            parts.append(str(contact["email"]))

        def clean_url(url: str) -> str:
            if not url: return ""
            u = str(url).strip()
            u = re.sub(r'^https?://(www\.)?', '', u).rstrip('/')
            return u

        if contact.get("linkedin"):
            parts.append(clean_url(contact["linkedin"]))
        if contact.get("github"):
            parts.append(clean_url(contact["github"]))
        if contact.get("location"):
            parts.append(str(contact["location"]))

        if parts:
            story.append(Paragraph(" | ".join(parts), contact_style))

        # ── 3. Professional Summary ──────────────────────────────
        summary = resume_data.get("summary", "")
        if summary:
            add_heading("Professional Summary")
            story.append(Paragraph(summary, body_style))

        # ── 4. Education ─────────────────────────────────────────
        education = resume_data.get("education", [])
        if education:
            add_heading("Education")
            for edu in education:
                degree = edu.get("degree", "")
                institution = edu.get("institution", "")
                year = edu.get("year", "")
                gpa = edu.get("gpa", "")

                left_parts = [f"<b>{degree}</b>"]
                if institution: left_parts.append(institution)
                if gpa:
                    gpa_str = str(gpa)
                    if not any(gpa_str.lower().startswith(x) for x in ["cgpa", "gpa", "percentage", "%"]) and not gpa_str.endswith("%"):
                        gpa_str = f"CGPA: {gpa_str}"
                    left_parts.append(gpa_str)
                left_text = " | ".join(left_parts)

                edu_table = Table(
                    [[Paragraph(left_text, ParagraphStyle('EduL', fontName='Helvetica', fontSize=9, textColor=DARK_TEXT, leading=12)),
                      Paragraph(f"<b>{year}</b>", ParagraphStyle('EduR', fontName='Helvetica', fontSize=9, alignment=TA_RIGHT, textColor=DARK_TEXT, leading=12))]],
                    colWidths=[420, 127]
                )
                edu_table.setStyle(TableStyle([
                    ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
                    ('LEFTPADDING', (0,0), (-1,-1), 0),
                    ('RIGHTPADDING', (0,0), (-1,-1), 0),
                    ('TOPPADDING', (0,0), (-1,-1), 0),
                    ('BOTTOMPADDING', (0,0), (-1,-1), 1.5),
                ]))
                story.append(edu_table)

        # ── 5. Technical Skills ──────────────────────────────────
        skills = resume_data.get("skills", [])
        if skills:
            add_heading("Technical Skills")
            if isinstance(skills, dict):
                for cat, sk_list in skills.items():
                    sk_str = ", ".join(sk_list) if isinstance(sk_list, list) else str(sk_list)
                    story.append(Paragraph(f"<b>{cat}:</b> {sk_str}", skill_line_style))
            else:
                categories = {
                    "Languages": ["python", "javascript", "typescript", "c++", "c", "java", "sql", "html5", "css3"],
                    "Software Engineering / Backend": ["node.js", "express", "flask", "fastapi", "django", "rest api", "jwt", "oauth", "graphql", "microservices"],
                    "AI / Generative AI": ["langchain", "rag", "faiss", "hugging face", "pytorch", "scikit-learn", "cursor", "nlp", "llm", "deep learning", "machine learning", "vector search"],
                    "Frontend": ["react", "react native", "next.js", "nextjs", "vue", "tailwind", "html", "css", "redux"],
                    "Databases": ["mysql", "mongodb", "sqlite", "postgresql", "firebase", "redis", "dynamodb"],
                    "DevOps / Tools": ["git", "github", "docker", "linux", "ubuntu", "ci/cd", "render", "aws", "gcp", "azure"]
                }
                
                categorized_output = {}
                flat_skills = []
                for s in skills:
                    if isinstance(s, str) and ":" in s:
                        parts = s.split(":", 1)
                        categorized_output[parts[0].strip()] = parts[1].strip()
                    else:
                        flat_skills.append(str(s))

                if not categorized_output and flat_skills:
                    assigned = set()
                    for cat_name, kw_list in categories.items():
                        matched = []
                        for s in flat_skills:
                            s_clean = s.strip()
                            s_lower = s_clean.lower()
                            if s_clean in assigned:
                                continue
                            if any(k in s_lower or s_lower in k for k in kw_list):
                                matched.append(s_clean)
                                assigned.add(s_clean)
                        if matched:
                            categorized_output[cat_name] = ", ".join(matched)
                    
                    remaining = [s for s in flat_skills if s not in assigned]
                    if remaining:
                        categorized_output["Other Technologies"] = ", ".join(remaining)

                if categorized_output:
                    for cat_name, sk_str in categorized_output.items():
                        story.append(Paragraph(f"<b>{cat_name}:</b> {sk_str}", skill_line_style))
                else:
                    story.append(Paragraph(" • ".join(str(s) for s in skills), skill_line_style))

        # ── 6. Projects ──────────────────────────────────────────
        projects = resume_data.get("projects", [])
        if projects:
            add_heading("Projects")
            for proj in projects:
                name = proj.get("name", "")
                techs = proj.get("technologies", [])
                date = proj.get("date", proj.get("year", ""))
                highlights = proj.get("highlights", [])
                desc = proj.get("description", "")

                story.append(Paragraph(f"<b>{name}</b>", project_title_style))

                tech_str = ", ".join(techs) if isinstance(techs, list) else str(techs)
                sub_table = Table(
                    [[Paragraph(f"<i>{tech_str}</i>", project_sub_style),
                      Paragraph(f"<b>{date}</b>" if date else "", project_date_style)]],
                    colWidths=[420, 127]
                )
                sub_table.setStyle(TableStyle([
                    ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
                    ('LEFTPADDING', (0,0), (-1,-1), 0),
                    ('RIGHTPADDING', (0,0), (-1,-1), 0),
                    ('TOPPADDING', (0,0), (-1,-1), 0),
                    ('BOTTOMPADDING', (0,0), (-1,-1), 1),
                ]))
                story.append(sub_table)

                bullets = list(highlights) if highlights else ([desc] if desc else [])
                for h in bullets:
                    h_text = h.strip()
                    if h_text.startswith("•"):
                        h_text = h_text.lstrip("•").strip()
                    words = h_text.split(" ", 1)
                    if len(words) == 2 and not words[0].startswith("<b>"):
                        formatted_bullet = f"• <b>{words[0]}</b> {words[1]}"
                    else:
                        formatted_bullet = f"• {h_text}"
                    story.append(Paragraph(formatted_bullet, bullet_style))

        # ── 7. Professional Experience ───────────────────────────
        experience = resume_data.get("experience", [])
        if experience:
            add_heading("Professional Experience")
            for exp in experience:
                title = exp.get("title", exp.get("role", ""))
                company = exp.get("company", "")
                date_range = exp.get("duration", f"{exp.get('start_date', '')} - {exp.get('end_date', 'Present')}".strip(" -"))
                location = exp.get("location", "")
                highlights = exp.get("highlights", [])
                desc = exp.get("description", "")

                header_left = f"<b>{title}</b> — <i>{company}</i>"
                if location: header_left += f", {location}"

                exp_table = Table(
                    [[Paragraph(header_left, project_title_style),
                      Paragraph(f"<b>{date_range}</b>", project_date_style)]],
                    colWidths=[420, 127]
                )
                exp_table.setStyle(TableStyle([
                    ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
                    ('LEFTPADDING', (0,0), (-1,-1), 0),
                    ('RIGHTPADDING', (0,0), (-1,-1), 0),
                    ('TOPPADDING', (0,0), (-1,-1), 0),
                    ('BOTTOMPADDING', (0,0), (-1,-1), 1),
                ]))
                story.append(exp_table)

                bullets = list(highlights) if highlights else ([desc] if desc else [])
                for h in bullets:
                    h_text = h.strip()
                    if h_text.startswith("•"):
                        h_text = h_text.lstrip("•").strip()
                    words = h_text.split(" ", 1)
                    if len(words) == 2 and not words[0].startswith("<b>"):
                        formatted_bullet = f"• <b>{words[0]}</b> {words[1]}"
                    else:
                        formatted_bullet = f"• {h_text}"
                    story.append(Paragraph(formatted_bullet, bullet_style))

        # ── 8. Achievements ──────────────────────────────────────
        achievements = resume_data.get("achievements") or resume_data.get("certifications", [])
        if achievements:
            add_heading("Achievements")
            for ach in achievements:
                ach_text = ach.strip()
                if ach_text.startswith("•"):
                    ach_text = ach_text.lstrip("•").strip()
                words = ach_text.split(" ", 2)
                if len(words) >= 2 and any(w.endswith(",") for w in words[:2]):
                    formatted_ach = f"• <b>{words[0]} {words[1]}</b> {' '.join(words[2:])}"
                elif len(words) >= 1:
                    formatted_ach = f"• <b>{words[0]}</b> {' '.join(words[1:])}"
                else:
                    formatted_ach = f"• {ach_text}"
                story.append(Paragraph(formatted_ach, bullet_style))

        doc_pdf.build(story)
        pdf_bytes = pdf_buffer.getvalue()
        pdf_buffer.close()
        return pdf_bytes

    except ImportError:
        logger.warning("reportlab not installed. Skipping PDF export.")
        return None
    except Exception as e:
        logger.error(f"PDF generation failed: {e}", exc_info=True)
        return None


def save_resume_pdf(docx_path: Optional[str], resume_data: Dict, job_id: int) -> Optional[str]:
    """Generate and save the ATS-compatible PDF to disk."""
    pdf_bytes = generate_resume_pdf_bytes(resume_data)
    if not pdf_bytes:
        return None
    pdf_path = os.path.join(OUTPUT_DIR, f"resume_job_{job_id}_{_ts()}.pdf")
    try:
        with open(pdf_path, "wb") as f:
            f.write(pdf_bytes)
        return pdf_path
    except Exception as e:
        logger.error(f"Failed to write PDF file: {e}")
        return None


def _ts():
    return datetime.now().strftime("%Y%m%d_%H%M%S")


def export_resume(resume_data: Dict, job_id: int) -> Dict[str, Optional[str]]:
    """Export resume to all formats. Returns dict of paths."""
    resume_data = clean_resume_data(resume_data)
    json_path = save_resume_json(resume_data, job_id)
    docx_path = save_resume_docx(resume_data, job_id)
    pdf_path = save_resume_pdf(docx_path, resume_data, job_id)
    return {
        "json": json_path,
        "docx": docx_path,
        "pdf": pdf_path
    }

