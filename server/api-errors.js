export const API_ERROR_RULES = {
  invalidDeckId: {
    status: 400,
    error: 'Invalid deck id',
    messages: ['invalid-deck-id'],
  },
  deckNotFound: {
    status: 404,
    error: 'Deck not found',
    codes: ['ENOENT'],
    messages: ['deck-not-found'],
  },
  deckAlreadyExists: {
    status: 409,
    error: 'Deck folder already exists',
    codes: ['EEXIST'],
    messages: ['deck-already-exists'],
  },
  unsupportedDeckSchema: {
    status: 400,
    error: 'Unsupported deck schema version',
    messages: ['unsupported-deck-schema'],
  },
  templateNotFound: {
    status: 404,
    error: 'Template not found',
    codes: ['ENOENT'],
    messages: ['template-not-found'],
  },
  templateAlreadyExists: {
    status: 409,
    error: 'Template already exists',
    codes: ['EEXIST'],
    messages: ['template-already-exists', 'deck-already-exists'],
  },
};

export function createApiError(status, message) {
  const err = /** @type {Error & { status: number }} */ (new Error(message));
  err.status = status;
  return err;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

function matchesRule(err, rule) {
  if (typeof rule.match === 'function') {
    return rule.match(err);
  }

  const messages = asArray(rule.message ?? rule.messages);
  if (messages.includes(err?.message)) {
    return true;
  }

  const codes = asArray(rule.code ?? rule.codes);
  return codes.includes(err?.code);
}

function mapApiError(err, rules) {
  if (Number.isInteger(err?.status) && err.status >= 400 && err.status <= 599) {
    return {
      status: err.status,
      error: err.message,
    };
  }

  for (const rule of rules) {
    if (matchesRule(err, rule)) {
      return {
        status: rule.status,
        error: rule.error,
      };
    }
  }

  return {
    status: 500,
    error: 'Internal server error',
  };
}

export function withApiErrorHandling(handler, rules = []) {
  return (req, res, next) => {
    Promise.resolve()
      .then(() => handler(req, res, next))
      .catch((err) => {
        if (res.headersSent) {
          console.error(err);
          return;
        }

        const mapped = mapApiError(err, rules);
        if (mapped.status >= 500) {
          console.error(err);
        }
        res.status(mapped.status).json({ error: mapped.error });
      });
  };
}
