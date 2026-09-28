export const PLAN_PRESENTATION = {
  header: {
    horizontalPadding: 13,
    verticalPadding: 9,
    brandFontSize: 10,
    titleFontSize: 17,
    titleTopMargin: 5,
    projectFontSize: 11,
    metadataFontSize: 8,
    metadataGap: 4,
  },
  section: {
    headerHeight: 26,
    horizontalPadding: 8,
    verticalPadding: 3,
    titleFontSize: 8,
    titleLineHeight: 1.05,
  },
  block: {
    titleFontSize: 8,
    titleLineHeight: 1.2,
    titleHorizontalPadding: 7,
    titleVerticalPadding: 5,
    descriptionFontSize: 7,
    descriptionLineHeight: 1.35,
    bodyPadding: 7,
    bodyColumnGap: 6,
    referenceFontSize: 5.7,
    referenceLineHeight: 1.2,
    referenceHorizontalMargin: 7,
    referenceTopPadding: 4,
    referenceBottomPadding: 5,
  },
  document: {
    titleFontSize: 9,
    bodyFontSize: 7,
  },
  titleBlock: {
    titleFontSize: 8,
    bodyFontSize: 6,
    horizontalPadding: 9,
    verticalPadding: 9,
    rowGap: 4,
  },
} as const;

// At 100% the 1189 x 841 canvas represents the 1189 x 841 mm A0 sheet.
// Keeping this conversion explicit prevents screen pixels from being mistaken for PDF points.
export const PLAN_MILLIMETRES_PER_CANVAS_PIXEL = 1;
