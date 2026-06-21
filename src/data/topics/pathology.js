/**
 * topics/pathology.js — Sample bundled question bank.
 *
 * This file demonstrates the expected shape bundled JSON modules should
 * follow. In production, swap/add files in this folder (one per topic is
 * a reasonable convention at 5,000+ question scale, since it keeps any
 * single file from becoming unwieldy and lets Vite code-split if you later
 * move to dynamic imports per topic).
 */

export const pathologyTopic = {
  id: 't1',
  title: 'General Pathology',
  summaryText:
    "# General Pathology\n\nThis chapter covers the body's fundamental responses to injury: **inflammation** as the acute defense mechanism, and **cellular adaptation** as the longer-term structural response to stress.\n\n[COLOR=blue]Focus areas for exams: mediator sequences, and distinguishing reversible from irreversible cell injury.[/COLOR]",
  subtopics: [
    {
      id: 't1_s1',
      title: 'Inflammation & Tissue Injury',
      summaryText:
        '# Acute Inflammation\n\nTissue injury triggers a stereotyped vascular and cellular response. The *immediate* event is **transient vasoconstriction**, lasting only seconds, followed by **vasodilation** that increases blood flow to the area.\n\n[IMG]/assets/injury_cascade.jpg[/IMG]\n\n## Key Mediators\n\n**Histamine**, released from mast cells, is the dominant early mediator — it causes endothelial gap formation, which increases vascular permeability and allows plasma proteins to leak into tissue.\n\n[COLOR=red]Common exam trap: students confuse the order — vasoconstriction comes FIRST, briefly, before vasodilation dominates.[/COLOR]\n\n## Chronic Inflammation\n\nWhen acute inflammation fails to resolve, the infiltrate shifts from neutrophils to **macrophages and lymphocytes** — this mononuclear shift is the hallmark of chronicity.',
      questions: [
        {
          id: 'q_104',
          questionText:
            'What is the primary vascular response following tissue injury? [IMG]/assets/injury_cascade.jpg[/IMG]',
          options: [
            'Transient vasoconstriction followed by vasodilation',
            'Persistent vasoconstriction only',
            'Immediate cellular apoptosis',
            'Localized amyloid aggregation',
          ],
          correctIndex: 0,
          explanation:
            'Chemical mediators like Histamine trigger immediate vasodilation of local arterioles. See pathway diagram: [IMG]/assets/vaso_path.jpg[/IMG]',
          reference: "Inflammation slide 1a; Robbin's Pathology 10th Ed Chapter 3",
          additionalInfo: 'Leukotriene B4 also coordinates systemic chemotaxis concurrently.',
          imagePath: '/assets/img1.jpg',
          relatedQuestionIds: ['q_105', 'q_201'],
        },
        {
          id: 'q_105',
          questionText: 'Which mediator is primarily responsible for increased vascular permeability in acute inflammation?',
          options: ['Histamine', 'Collagen', 'Elastin', 'Keratin'],
          correctIndex: 0,
          explanation: 'Histamine released from mast cells causes endothelial gap formation, increasing permeability.',
          reference: "Robbin's Pathology 10th Ed Chapter 3",
          additionalInfo: '',
          imagePath: '',
          relatedQuestionIds: ['q_104'],
        },
        {
          id: 'q_106',
          questionText: 'Chronic inflammation is most characteristically infiltrated by which cell type?',
          options: ['Neutrophils', 'Macrophages and lymphocytes', 'Eosinophils only', 'Platelets'],
          correctIndex: 1,
          explanation: 'Mononuclear cells (macrophages, lymphocytes, plasma cells) dominate chronic inflammatory infiltrates.',
          reference: "Robbin's Pathology 10th Ed Chapter 3",
          additionalInfo: '',
          imagePath: '',
          relatedQuestionIds: [],
        },
      ],
    },
    {
      id: 't1_s2',
      title: 'Cellular Adaptation',
      questions: [
        {
          id: 'q_201',
          questionText: 'Apoptosis differs from necrosis primarily in that apoptosis:',
          options: [
            'Is an active, energy-dependent, programmed process',
            'Always triggers a robust inflammatory response',
            'Results in random DNA degradation only',
            'Is caused exclusively by hypoxia',
          ],
          correctIndex: 0,
          explanation: 'Apoptosis is ATP-dependent and tightly regulated, unlike the passive process of necrosis.',
          reference: "Robbin's Pathology 10th Ed Chapter 2",
          additionalInfo: 'Caspase activation is the key executionary step.',
          imagePath: '',
          relatedQuestionIds: ['q_104'],
        },
        {
          id: 'q_202',
          questionText: 'Hypertrophy of cardiac myocytes in response to chronic hypertension is an example of:',
          options: ['Hyperplasia', 'Hypertrophy', 'Metaplasia', 'Dysplasia'],
          correctIndex: 1,
          explanation: 'Cardiac myocytes are terminally differentiated and respond to increased workload by enlarging (hypertrophy), not dividing.',
          reference: "Robbin's Pathology 10th Ed Chapter 2",
          additionalInfo: '',
          imagePath: '',
          relatedQuestionIds: [],
        },
      ],
    },
  ],
};
