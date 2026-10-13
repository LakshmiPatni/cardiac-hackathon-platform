// Plain-language text about each labelled part. Keys are the part ids the 3D viewer uses.
export const PART_INFO = {
  LAD: {
    title: 'Left anterior descending artery (LAD)',
    short: 'Front wall and tip of the heart',
    what: 'Runs down the front of the heart from top to bottom. It brings blood to the front wall and the tip of the heart, including a large part of the main pumping chamber (the left ventricle).',
    why: 'Because it feeds so much heart muscle, a narrowing here can have a big effect on how well the heart pumps.',
    checked: true,
  },
  LCX: {
    title: 'Left circumflex artery (LCX)',
    short: 'Side and back of the main pumping chamber',
    what: 'Curls around the left side of the heart towards the back. It brings blood to the side and back walls of the main pumping chamber.',
    why: 'Much of it runs round the back of the heart, so try the Posterior view to see it.',
    checked: true,
  },
  RCA: {
    title: 'Right coronary artery (RCA)',
    short: 'Right side and bottom of the heart',
    what: 'Runs along the right side of the heart and underneath it. It brings blood to the right side and the bottom wall of the heart and, in many people, to parts of the heart\'s natural electrical system.',
    why: 'A narrowing here can affect the bottom of the heart and sometimes the heart\'s rhythm.',
    checked: true,
  },
  AO: {
    title: 'Aorta',
    short: 'The body\'s main artery',
    what: 'The body\'s main artery. Oxygen-rich blood leaves the heart through it on its way to the rest of the body. The two coronary arteries start right at its base.',
    why: 'Every drop of blood the heart muscle receives for itself comes through those two openings at the base of the aorta.',
  },
  PA: {
    title: 'Pulmonary artery',
    short: 'Carries blood to the lungs',
    what: 'Carries blood that has used up its oxygen from the right side of the heart to the lungs, where it picks up fresh oxygen.',
    why: 'It is one of the few arteries that carries low-oxygen blood.',
  },
  SVC: {
    title: 'Superior vena cava',
    short: 'Brings used blood back from the upper body',
    what: 'A large vein that brings used, low-oxygen blood from the head, arms and upper body back into the right side of the heart.',
    why: 'Veins carry blood towards the heart. They are drawn in purple here to tell them apart from arteries.',
  },
  IVC: {
    title: 'Inferior vena cava',
    short: 'Brings used blood back from the lower body',
    what: 'The matching vein for the lower body. It brings used blood up from the legs and belly into the right side of the heart.',
    why: 'Together with the superior vena cava it returns all the body\'s used blood to the heart.',
  },
};

export const CHECKED_ARTERIES = ['LAD', 'LCX', 'RCA'];
export const OTHER_PARTS = ['AO', 'PA', 'SVC', 'IVC'];

// Used in the results text: "the LAD feeds ..."
export const VESSEL_AREA = {
  LAD: 'the front wall and tip of the heart',
  LCX: 'the side and back of the main pumping chamber',
  RCA: 'the right side and bottom of the heart',
};
