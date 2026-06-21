/**
 * topics/cardiology.js — Second sample bundled topic.
 */

export const cardiologyTopic = {
  id: 't2',
  title: 'Cardiovascular Pathology',
  subtopics: [
    {
      id: 't2_s1',
      title: 'Heart Failure',
      questions: [
        {
          id: 'q_301',
          questionText: 'B-type natriuretic peptide (BNP) is released in response to:',
          options: [
            'Ventricular wall stretch',
            'Decreased atrial pressure',
            'Hyperkalemia',
            'Increased renal perfusion',
          ],
          correctIndex: 0,
          explanation: 'BNP is secreted by ventricular myocardium in response to wall stretch from volume/pressure overload.',
          reference: "Robbin's Pathology 10th Ed Chapter 12",
          additionalInfo: 'Used clinically as a biomarker for heart failure severity.',
          imagePath: '',
          relatedQuestionIds: ['q_302'],
        },
        {
          id: 'q_302',
          questionText: 'Left-sided heart failure most directly leads to congestion of which organ?',
          options: ['Liver', 'Lungs', 'Spleen', 'Kidneys only'],
          correctIndex: 1,
          explanation: 'Left heart failure causes pulmonary venous congestion and edema.',
          reference: "Robbin's Pathology 10th Ed Chapter 12",
          additionalInfo: '',
          imagePath: '',
          relatedQuestionIds: ['q_301'],
        },
      ],
    },
  ],
};
