/**
 * Who this deployment belongs to.
 *
 * Every visible name used to be the literal "CUSAT", in 32 places across 11
 * files, which is fine for one hostel and useless the moment a second one
 * wants to look at the app. One build-time variable now drives all of them.
 *
 * The default is CUSAT, so a build with no environment set produces exactly
 * the strings the app has always shown -- the live deployment is unaffected
 * by this existing.
 *
 *     VITE_ORG_NAME="Greenwood" npm run build
 *
 * The names are derived from the one word rather than configured
 * separately: a tenant that needs "Greenwood MessConnect" also needs
 * "Greenwood Mess Office", and asking for five variables invites them
 * disagreeing with each other.
 */
const ORG = (import.meta.env.VITE_ORG_NAME as string | undefined)?.trim() || 'CUSAT';

interface Brand {
  org: string; app: string; mess: string; office: string;
  hostelOffice: string; administration: string; hostelMess: string; slug: string;
  institution: string; address: string;
}

// Typed as plain strings, deliberately. `as const` here infers template
// literal types like `${string} Hostel Mess 1`, which then makes
// INITIAL_STUDENT.hostel too narrow to hold BRAND.administration.
export const BRAND: Brand = {
  /** "CUSAT" -- the bare organisation name. */
  org: ORG,
  /** "CUSAT MessConnect" -- the product, as a student sees it. */
  app: `${ORG} MessConnect`,
  /** "CUSAT Hostel Mess 1" -- the default mess a student belongs to. */
  mess: `${ORG} Hostel Mess 1`,
  /** "CUSAT Mess Office" / "CUSAT Hostel Mess Office". */
  office: `${ORG} Mess Office`,
  hostelOffice: `${ORG} Hostel Mess Office`,
  /** "CUSAT Mess Administration" -- shown to admins in place of a hostel. */
  administration: `${ORG} Mess Administration`,
  /** "CUSAT Hostel Mess" -- prose and footers. */
  hostelMess: `${ORG} Hostel Mess`,
  /** For file names: no spaces. "CUSAT_Individual_Student_Billing_…" */
  slug: ORG.replace(/\s+/g, '_'),
  /** The institution's full legal name, spelled out in footers and on the
   *  bill. NOT derivable from the short name, so it is its own variable. */
  institution: (import.meta.env.VITE_ORG_FULL_NAME as string | undefined)?.trim()
    || 'Cochin University of Science and Technology',
  /** Postal address, shown in the privacy and terms pages. */
  address: (import.meta.env.VITE_ORG_ADDRESS as string | undefined)?.trim()
    || 'Cochin University of Science and Technology, Kalamassery, Kochi, Kerala 682022, India.',
};
